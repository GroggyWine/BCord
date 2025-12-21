#include "websocket_manager.h"
#include <iostream>
#include <queue>

extern std::mutex cout_mutex;
static void ws_log(const std::string& msg) {
    std::lock_guard<std::mutex> lock(cout_mutex);
    std::cout << "[" << std::time(nullptr) << "] [WS] " << msg << std::endl;
}

// =============================================================================
// WebSocketManager Implementation
// =============================================================================

void WebSocketManager::add_connection(const std::string& username, std::shared_ptr<WebSocketSession> session) {
    bool was_offline = false;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        was_offline = connections_.find(username) == connections_.end();
        connections_[username].insert(session);
        ws_log("User connected: " + username + " (total: " + std::to_string(connections_[username].size()) + " sessions)");
    }
    
    // Broadcast user_online if this is their first connection
    if (was_offline) {
        nlohmann::json event;
        event["type"] = "user_online";
        event["username"] = username;
        event["timestamp"] = std::time(nullptr);
        broadcast(event);
        ws_log("Broadcasting user_online: " + username);
    }
}

void WebSocketManager::remove_connection(const std::string& username, std::shared_ptr<WebSocketSession> session) {
    bool is_now_offline = false;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = connections_.find(username);
        if (it != connections_.end()) {
            it->second.erase(session);
            if (it->second.empty()) {
                connections_.erase(it);
                is_now_offline = true;
                // Also remove from all subscriptions
                for (auto& [server_id, users] : server_subscriptions_) {
                    users.erase(username);
                }
                for (auto& [dm_id, users] : dm_subscriptions_) {
                    users.erase(username);
                }
            }
        }
        ws_log("User disconnected: " + username);
    }
    
    // Broadcast user_offline if they have no more connections
    if (is_now_offline) {
        nlohmann::json event;
        event["type"] = "user_offline";
        event["username"] = username;
        event["timestamp"] = std::time(nullptr);
        broadcast(event);
        ws_log("Broadcasting user_offline: " + username);
    }
}

void WebSocketManager::send_to_user(const std::string& username, const nlohmann::json& msg) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = connections_.find(username);
    if (it != connections_.end()) {
        std::string msg_str = msg.dump();
        for (auto& session : it->second) {
            session->send(msg_str);
        }
    }
}

void WebSocketManager::send_to_server(int64_t server_id, const nlohmann::json& msg) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = server_subscriptions_.find(server_id);
    if (it != server_subscriptions_.end()) {
        std::string msg_str = msg.dump();
        std::string msg_type = msg.contains("type") ? msg["type"].get<std::string>() : "unknown";
        ws_log("Broadcasting " + msg_type + " to server " + std::to_string(server_id) + " (" + std::to_string(it->second.size()) + " subscribers)");
        for (const auto& username : it->second) {
            auto conn_it = connections_.find(username);
            if (conn_it != connections_.end()) {
                for (auto& session : conn_it->second) {
                    session->send(msg_str);
                }
            }
        }
    } else {
        ws_log("No subscribers for server " + std::to_string(server_id));
    }
}

void WebSocketManager::send_to_dm(int64_t dm_id, const nlohmann::json& msg) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = dm_subscriptions_.find(dm_id);
    if (it != dm_subscriptions_.end()) {
        std::string msg_str = msg.dump();
        for (const auto& username : it->second) {
            auto conn_it = connections_.find(username);
            if (conn_it != connections_.end()) {
                for (auto& session : conn_it->second) {
                    session->send(msg_str);
                }
            }
        }
    }
}

void WebSocketManager::broadcast(const nlohmann::json& msg) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::string msg_str = msg.dump();
    for (auto& [username, sessions] : connections_) {
        for (auto& session : sessions) {
            session->send(msg_str);
        }
    }
}

size_t WebSocketManager::online_count() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return connections_.size();
}

void WebSocketManager::subscribe_to_server(const std::string& username, int64_t server_id) {
    std::lock_guard<std::mutex> lock(mutex_);
    server_subscriptions_[server_id].insert(username);
    ws_log("User " + username + " subscribed to server " + std::to_string(server_id));
}

void WebSocketManager::subscribe_to_dm(const std::string& username, int64_t dm_id) {
    std::lock_guard<std::mutex> lock(mutex_);
    dm_subscriptions_[dm_id].insert(username);
    ws_log("User " + username + " subscribed to DM " + std::to_string(dm_id));
}

void WebSocketManager::unsubscribe_from_server(const std::string& username, int64_t server_id) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = server_subscriptions_.find(server_id);
    if (it != server_subscriptions_.end()) {
        it->second.erase(username);
    }
}

// =============================================================================
// WebSocketSession Implementation - SYNCHRONOUS for thread-per-connection model
// =============================================================================

WebSocketSession::WebSocketSession(tcp::socket&& socket)
    : ws_(std::move(socket)) {
}

void WebSocketSession::run(const std::string& username) {
    username_ = username;
    
    // Set WebSocket options - increase timeout for long-lived connections
    ws_.set_option(websocket::stream_base::timeout{
        std::chrono::seconds(30),    // handshake timeout
        std::chrono::seconds(300),   // idle timeout (5 min)
        true                          // enable pings
    });
    
    // Register with manager
    WebSocketManager::instance().add_connection(username_, shared_from_this());
    
    // Send welcome message
    nlohmann::json welcome;
    welcome["type"] = "connected";
    welcome["username"] = username_;
    welcome["message"] = "WebSocket connection established";
    send(welcome.dump());
    
    // Main read loop - SYNCHRONOUS
    beast::flat_buffer buffer;
    beast::error_code ec;
    
    while (!closed_) {
        buffer.clear();
        
        // Blocking read
        ws_.read(buffer, ec);
        
        if (ec == websocket::error::closed) {
            ws_log("Client closed connection: " + username_);
            break;
        }
        
        if (ec) {
            ws_log("Read error for " + username_ + ": " + ec.message());
            break;
        }
        
        // Handle the message
        std::string msg = beast::buffers_to_string(buffer.data());
        handle_message(msg);
    }
    
    // Cleanup
    WebSocketManager::instance().remove_connection(username_, shared_from_this());
}

void WebSocketSession::send(const std::string& msg) {
    std::lock_guard<std::mutex> lock(write_mutex_);
    if (closed_) return;
    
    try {
        ws_.text(true);
        ws_.write(net::buffer(msg));
    } catch (const std::exception& e) {
        ws_log("Send error for " + username_ + ": " + e.what());
    }
}

void WebSocketSession::close() {
    std::lock_guard<std::mutex> lock(write_mutex_);
    if (closed_) return;
    closed_ = true;
    
    try {
        ws_.close(websocket::close_code::normal);
    } catch (...) {
        // Ignore close errors
    }
}

void WebSocketSession::handle_message(const std::string& msg) {
    try {
        auto j = nlohmann::json::parse(msg);
        std::string type = j.value("type", "");
        
        ws_log("Received message type: " + type + " from " + username_);
        
        if (type == "ping") {
            // Respond with pong
            nlohmann::json pong;
            pong["type"] = "pong";
            pong["timestamp"] = std::time(nullptr);
            send(pong.dump());
        }
        else if (type == "subscribe_server") {
            int64_t server_id = j.value("server_id", (int64_t)0);
            if (server_id > 0) {
                WebSocketManager::instance().subscribe_to_server(username_, server_id);
                
                nlohmann::json ack;
                ack["type"] = "subscribed";
                ack["target"] = "server";
                ack["server_id"] = server_id;
                send(ack.dump());
            }
        }
        else if (type == "subscribe_dm") {
            int64_t dm_id = j.value("dm_id", (int64_t)0);
            if (dm_id > 0) {
                WebSocketManager::instance().subscribe_to_dm(username_, dm_id);
                
                nlohmann::json ack;
                ack["type"] = "subscribed";
                ack["target"] = "dm";
                ack["dm_id"] = dm_id;
                send(ack.dump());
            }
        }
        else if (type == "unsubscribe_server") {
            int64_t server_id = j.value("server_id", (int64_t)0);
            if (server_id > 0) {
                WebSocketManager::instance().unsubscribe_from_server(username_, server_id);
            }
        }
        else if (type == "typing") {
            // Broadcast typing indicator
            int64_t server_id = j.value("server_id", (int64_t)0);
            std::string channel = j.value("channel", "");
            int64_t dm_id = j.value("dm_id", (int64_t)0);
            
            nlohmann::json typing_event;
            typing_event["type"] = "typing";
            typing_event["username"] = username_;
            
            if (server_id > 0 && !channel.empty()) {
                typing_event["server_id"] = server_id;
                typing_event["channel"] = channel;
                WebSocketManager::instance().send_to_server(server_id, typing_event);
            } else if (dm_id > 0) {
                typing_event["dm_id"] = dm_id;
                WebSocketManager::instance().send_to_dm(dm_id, typing_event);
            }
        }
        else {
            ws_log("Unknown message type from " + username_ + ": " + type);
        }
    } catch (const std::exception& e) {
        ws_log("Error handling message from " + username_ + ": " + e.what());
    }
}

#ifndef WEBSOCKET_MANAGER_H
#define WEBSOCKET_MANAGER_H

#include <string>
#include <map>
#include <set>
#include <mutex>
#include <memory>
#include <functional>
#include <boost/beast/websocket.hpp>
#include <boost/beast/core.hpp>
#include <boost/beast/http.hpp>
#include <boost/asio.hpp>
#include <nlohmann/json.hpp>

namespace beast = boost::beast;
namespace websocket = beast::websocket;
namespace net = boost::asio;
using tcp = net::ip::tcp;

// Forward declaration
class WebSocketSession;

// Thread-safe connection manager
class WebSocketManager {
public:
    static WebSocketManager& instance() {
        static WebSocketManager mgr;
        return mgr;
    }
    
    void add_connection(const std::string& username, std::shared_ptr<WebSocketSession> session);
    void remove_connection(const std::string& username, std::shared_ptr<WebSocketSession> session);
    void send_to_user(const std::string& username, const nlohmann::json& msg);
    void send_to_server(int64_t server_id, const nlohmann::json& msg);
    void send_to_dm(int64_t dm_id, const nlohmann::json& msg);
    void broadcast(const nlohmann::json& msg);
    size_t online_count() const;
    void subscribe_to_server(const std::string& username, int64_t server_id);
    void subscribe_to_dm(const std::string& username, int64_t dm_id);
    void unsubscribe_from_server(const std::string& username, int64_t server_id);

private:
    WebSocketManager() = default;
    
    mutable std::mutex mutex_;
    std::map<std::string, std::set<std::shared_ptr<WebSocketSession>>> connections_;
    std::map<int64_t, std::set<std::string>> server_subscriptions_;
    std::map<int64_t, std::set<std::string>> dm_subscriptions_;
};

// Individual WebSocket session - synchronous for thread-per-connection model
class WebSocketSession : public std::enable_shared_from_this<WebSocketSession> {
public:
    explicit WebSocketSession(tcp::socket&& socket);
    
    // Accept WebSocket handshake
    template<class Body, class Allocator>
    void accept(boost::beast::http::request<Body, boost::beast::http::basic_fields<Allocator>>& req) {
        ws_.accept(req);
    }
    
    // Run the session (blocking - handles read loop)
    void run(const std::string& username);
    
    // Send a message (thread-safe)
    void send(const std::string& msg);
    
    // Close the connection
    void close();
    
    const std::string& username() const { return username_; }

private:
    void handle_message(const std::string& msg);
    
    websocket::stream<tcp::socket> ws_;
    std::string username_;
    std::mutex write_mutex_;
    bool closed_ = false;
};

#endif // WEBSOCKET_MANAGER_H

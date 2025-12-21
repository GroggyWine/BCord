import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import useTokenRefresher from "../hooks/useTokenRefresher";
import { playDoorbellDingDong, playMessageSent, playChannelClick, playInviteChime, playLeaveDm, playServerClick, playNewMessage } from "../utils/sounds";

import FriendsModal from "./FriendsModal";
import { useWebSocket } from "../hooks/useWebSocket";
import EmojiPicker from "./EmojiPicker";
import ExpandableMessage from "./ExpandableMessage";
export default function DmPage() {
  const { dmId } = useParams();
  const navigate = useNavigate();
  
  useTokenRefresher(10);
  
  // State - mirrors ChatPage
  const [servers, setServers] = useState([]);
  const [selectedServerId, setSelectedServerId] = useState(null);
  const [dmList, setDmList] = useState([]);
  const [selectedDmId, setSelectedDmId] = useState(dmId ? Number(dmId) : null);
  const [otherUsername, setOtherUsername] = useState("");
  const [messages, setMessages] = useState([]);
  const [newBody, setNewBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [rumbleVideos, setRumbleVideos] = useState([]);
  const [rumbleCollapsed, setRumbleCollapsed] = useState(false);
  const [leftSectionWidth, setLeftSectionWidth] = useState(210);
  const [friends, setFriends] = useState([]);
  const [friendsDrawerOpen, setFriendsDrawerOpen] = useState(false);
  const [hasUnreadDms, setHasUnreadDms] = useState(false);
  const [unreadDmUsers, setUnreadDmUsers] = useState({}); // { dm_id: true/false }
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPanelError, setAdminPanelError] = useState("");
  const [adminVerified, setAdminVerified] = useState(false);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [invitationsOpen, setInvitationsOpen] = useState(false);
  const [pendingFriendRequests, setPendingFriendRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadServers, setUnreadServers] = useState({}); // { serverId: true/false }
  
  // DM list context menu and drag-drop state
  const [dmContextMenu, setDmContextMenu] = useState({ visible: false, x: 0, y: 0, dm: null });
  const [draggingDm, setDraggingDm] = useState(null);
  const [dragOverDm, setDragOverDm] = useState(null);
  const [dragSection, setDragSection] = useState(null); // "pinned" or "normal"
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingBody, setEditingBody] = useState("");
  const messagesEndRef = useRef(null);
  const prevMessageCountRef = useRef(0);
  const messageInputRef = useRef(null);
  const friendsDrawerRef = useRef(null);
  const resizingRef = useRef(null);

  const userInitials = currentUser ? currentUser.slice(0, 2).toUpperCase() : "??";

  // ==========================================================================
  // WebSocket for real-time DM communication
  // ==========================================================================
  const handleWebSocketMessage = useCallback((data) => {
    console.log('[WS DM] Received:', data.type);
    
    if (data.type === 'new_dm') {
      // Handle new DM from WebSocket
      const { dm_id, message } = data;
      const senderUsername = message?.sender_username;
      const dmIdNum = Number(dm_id);
      
      // If sender is current user, ignore (we already added it locally)
      if (senderUsername === currentUser) {
        // Just add to messages if we're viewing this DM
        if (dmIdNum === selectedDmId) {
          setMessages(prev => {
            const exists = prev.some(m => m.dm_message_id === message.dm_message_id);
            if (exists) return prev;
            return [...prev, message];
          });
        }
        // Never show unread indicator for our own messages
        return;
      }
      
      // Message is from someone else
      // If this DM is currently selected, add message to list (no unread indicator needed)
      if (dmIdNum === selectedDmId) {
        setMessages(prev => {
          const exists = prev.some(m => m.dm_message_id === message.dm_message_id);
          if (exists) return prev;
          return [...prev, message];
        });
        // Mark as read in backend since user is viewing this chat
        // This prevents the unread indicator when navigating away
        axios.post(`/api/dm/${dmIdNum}/mark-read`, {}, { withCredentials: true }).catch(() => {});
        return;
      }
      
      // Message is for a different DM - mark it as unread
      playDoorbellDingDong();
      setHasUnreadDms(true);
      // Update dmList to show unread for this specific DM
      setDmList(prev => prev.map(d => 
        d.dm_id === dmIdNum ? { ...d, has_unread: true } : d
      ));
    }
    else if (data.type === 'typing' && data.dm_id) {
      // Could show typing indicator here
      console.log(`[WS DM] ${data.username} is typing in DM ${data.dm_id}`);
    }
    else if (data.type === 'new_message') {
      // Handle new server channel message - update unread indicator
      const { server_id, channel, message } = data;
      const serverIdNum = Number(server_id);
      
      console.log('[DmPage WS] new_message received:', { server_id: serverIdNum, channel, sender: message?.sender, currentUser });
      
      // Don't mark as unread if sender is current user
      if (message?.sender === currentUser) {
        console.log('[DmPage WS] Ignoring own message');
        return;
      }
      
      // Play notification sound and mark server as having unread messages
      playNewMessage();
      console.log('[DmPage WS] Setting unread for server:', serverIdNum);
      setUnreadServers(prev => ({ ...prev, [serverIdNum]: true }));
    }
    else if (data.type === 'user_online') {
      setOnlineUsers(prev => [...new Set([...prev, data.username])]);
    }
    else if (data.type === 'user_offline') {
      setOnlineUsers(prev => prev.filter(u => u !== data.username));
    }
  }, [selectedDmId, currentUser]);

  const { send: wsSend, subscribeToDm, subscribeToServer, isConnected: wsConnected } = useWebSocket(handleWebSocketMessage);

  // Subscribe to current DM when it changes
  useEffect(() => {
    if (selectedDmId && wsConnected) {
      subscribeToDm(selectedDmId);
    }
  }, [selectedDmId, wsConnected, subscribeToDm]);

  // Load current user and check admin status
  useEffect(() => {
    async function loadUser() {
      try {
        const res = await axios.get("/api/profile", { withCredentials: true });
        if (res.data?.user) {
          setCurrentUser(res.data.user);
          // is_admin is now returned directly from /api/profile
          setIsAdmin(res.data.is_admin || false);
        } else {
          navigate("/login");
        }
      } catch (err) {
        navigate("/login");
      }
    }
    loadUser();
  }, [navigate]);

  // Load servers (for rail)
  useEffect(() => {
    async function loadServers() {
      try {
        const res = await axios.get("/api/servers/list", { withCredentials: true });
        if (res.data?.servers) {
          setServers(res.data.servers);
        }
      } catch (err) {
        console.error("Failed to load servers:", err);
      }
    }
    loadServers();
  }, []);

  // Fetch server unread status on mount only (WebSocket handles real-time)
  useEffect(() => {
    async function fetchServerUnreadStatus() {
      if (servers.length === 0) return;
      
      const serverUnreadMap = {};
      
      for (const server of servers) {
        try {
          const res = await axios.get(`/api/servers/${server.id}/unread`, {
            withCredentials: true,
          });
          
          // Server has unread if ANY channel has unread
          let serverHasUnread = false;
          if (res.data.channels) {
            serverHasUnread = res.data.channels.some(ch => ch.has_unread);
          }
          serverUnreadMap[server.id] = serverHasUnread;
        } catch (err) {
          console.error(`Failed to fetch unread for server ${server.id}:`, err);
        }
      }
      
      setUnreadServers(serverUnreadMap);
    }

    fetchServerUnreadStatus(); // Only on mount/servers change, WebSocket handles real-time
  }, [servers]);

  // Subscribe to all servers for real-time unread updates
  useEffect(() => {
    if (servers.length === 0) {
      console.log('[DmPage] No servers to subscribe to');
      return;
    }
    if (!wsConnected) {
      console.log('[DmPage] WebSocket not connected yet, waiting...');
      return;
    }
    
    console.log('[DmPage] WebSocket connected, subscribing to', servers.length, 'servers:', servers.map(s => s.id));
    
    // Subscribe to each server for unread notifications
    servers.forEach(server => {
      console.log('[DmPage] Subscribing to server:', server.id, server.name);
      subscribeToServer(server.id);
    });
  }, [wsConnected, servers, subscribeToServer]);

  // Load DM list
  useEffect(() => {
    async function loadDmList() {
      try {
        const res = await axios.get("/api/dm/list", { withCredentials: true });
        let list = res.data?.dms || (Array.isArray(res.data) ? res.data : []);
        
        if (dmId) {
          const targetId = Number(dmId);
          const match = list.find(d => d.dm_id === targetId);
          if (match) {
            setSelectedDmId(targetId);
            setOtherUsername(match.other_username || "Unknown");
            
            // Mark this DM as not unread in local state since we're viewing it
            list = list.map(dm => 
              dm.dm_id === targetId ? { ...dm, has_unread: false } : dm
            );
            
            // Call mark-read API for this DM
            axios.post(`/api/dm/${targetId}/mark-read`, {}, { withCredentials: true }).catch(() => {});
          }
        }
        
        setDmList(list);
        
        // Update hasUnreadDms based on list (exclude selected DM)
        const anyUnread = list.some(dm => dm.has_unread);
        setHasUnreadDms(anyUnread);
        
      } catch (err) {
        console.error("Load DM list error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadDmList();
  }, [dmId]);

  // Load messages
  useEffect(() => {
    if (!selectedDmId) return;
    prevMessageCountRef.current = 0;

    const loadMessages = async () => {
      try {
        const res = await axios.get(`/api/dm/thread?dm_id=${selectedDmId}`, { withCredentials: true });
        let msgs = res.data?.messages || (Array.isArray(res.data) ? res.data : []);
        
        if (msgs.length > prevMessageCountRef.current && prevMessageCountRef.current > 0) {
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg?.sender_username !== currentUser) {
            playDoorbellDingDong();
          }
        }
        prevMessageCountRef.current = msgs.length;
        setMessages(msgs);
      } catch (err) {
        console.error("Load messages error:", err);
      }
    };

    loadMessages();
    const interval = setInterval(loadMessages, 30000); // Reduced to 30s - WebSocket handles real-time
    return () => clearInterval(interval);
  }, [selectedDmId, currentUser]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Poll DM list
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await axios.get("/api/dm/list", { withCredentials: true });
        let list = res.data?.dms || (Array.isArray(res.data) ? res.data : []);
        
        // Don't mark current DM as unread since we're viewing it
        list = list.map(dm => 
          dm.dm_id === selectedDmId ? { ...dm, has_unread: false } : dm
        );
        
        setDmList(prev => JSON.stringify(prev) !== JSON.stringify(list) ? list : prev);
        
        // Update hasUnreadDms - exclude current DM
        const anyUnread = list.some(dm => dm.has_unread && dm.dm_id !== selectedDmId);
        setHasUnreadDms(anyUnread);
      } catch (err) {}
    }, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, [selectedDmId]);

  // Load Rumble lineup
  useEffect(() => {
    const fetchRumble = async () => {
      try {
        const res = await axios.get('/api/rumble/lineup');
        if (res.data?.lineup) {
          const videos = res.data.lineup.map(item => ({
            title: item.title,
            channel: item.channelId || item.name,
            video_url: item.url,
            thumbnail: item.thumbnail,
            isLive: item.isLive || false,
            type: item.type
          }));
          setRumbleVideos(videos);
        }
      } catch (err) {
        console.error("Rumble fetch error:", err);
      }
    };
    fetchRumble();
    const interval = setInterval(fetchRumble, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, []);

  // Load friends
  useEffect(() => {
    async function loadFriends() {
      try {
        const res = await axios.get("/api/users/list", { withCredentials: true });
        if (res.data?.users) {
          const usernames = res.data.users
            .map(u => u.username)
            .filter(u => u !== currentUser);
          setFriends(usernames);
        }
      } catch (err) {}
    }
    if (currentUser) loadFriends();
  }, [currentUser]);

  // Poll online users
  useEffect(() => {
    const fetchOnline = async () => {
      try {
        const res = await axios.get("/api/users/online", { withCredentials: true });
        if (res.data?.online) setOnlineUsers(res.data.online);
      } catch (err) {}
    };
    fetchOnline();
    const interval = setInterval(fetchOnline, 10000);
    return () => clearInterval(interval);
  }, []);

  // Send heartbeat to keep user marked as online
  useEffect(() => {
    if (!currentUser) return;
    
    const sendHeartbeat = async () => {
      try {
        await axios.post("/api/users/heartbeat", {}, { withCredentials: true });
      } catch (err) {
        // Silently fail - not critical
      }
    };
    
    sendHeartbeat(); // Send immediately on mount
    const interval = setInterval(sendHeartbeat, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [currentUser]);

  // Poll invitations and friend requests for real-time bell notifications
  useEffect(() => {
    const pollNotifications = async () => {
      try {
        // Fetch server invitations
        const invResp = await axios.get("/api/invitations", {
          withCredentials: true,
        });
        const newInvites = invResp.data.invitations || [];
        setInvitations(prev => {
          if (newInvites.length > prev.length) {
            playInviteChime();
          }
          return newInvites;
        });
        
        // Fetch pending friend requests
        const friendResp = await axios.get("/api/friends/pending", {
          withCredentials: true,
        });
        const newFriendReqs = friendResp.data.requests || [];
        setPendingFriendRequests(prev => {
          if (newFriendReqs.length > prev.length) {
            playInviteChime();
          }
          return newFriendReqs;
        });
      } catch (err) {
        // Silently fail - dont spam console
      }
    };
    
    pollNotifications(); // Initial fetch
    const interval = setInterval(pollNotifications, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Close friends drawer on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (friendsDrawerOpen && friendsDrawerRef.current && !friendsDrawerRef.current.contains(e.target)) {
        setFriendsDrawerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [friendsDrawerOpen]);

  // Resize handler
  const handleResizeStart = (e) => {
    e.preventDefault();
    resizingRef.current = true;
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = useCallback((e) => {
    if (!resizingRef.current) return;
    const newWidth = Math.max(180, Math.min(350, e.clientX));
    setLeftSectionWidth(newWidth);
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizingRef.current = false;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove]);

  // Notification handlers
  async function handleAcceptInvitation(invitationId, serverId) {
    try {
      await axios.post(`/api/invitations/${invitationId}/accept`, {}, { withCredentials: true });
      // Reload invitations
      const invRes = await axios.get("/api/invitations", { withCredentials: true });
      setInvitations(invRes.data.invitations || []);
      // Reload servers to show the newly joined server
      const serverRes = await axios.get("/api/servers/list", { withCredentials: true });
      if (serverRes.data?.servers) {
        setServers(serverRes.data.servers);
      }
    } catch (err) {
      alert(err.response?.data?.error || "Failed to accept invitation");
    }
  }

  async function handleDeclineInvitation(invitationId) {
    try {
      await axios.post(`/api/invitations/${invitationId}/decline`, {}, { withCredentials: true });
      const invRes = await axios.get("/api/invitations", { withCredentials: true });
      setInvitations(invRes.data.invitations || []);
    } catch (err) {
      alert(err.response?.data?.error || "Failed to decline invitation");
    }
  }

  async function handleAcceptFriendRequest(requestId, fromUsername) {
    try {
      await axios.post("/api/friends/accept", { request_id: requestId }, { withCredentials: true });
      const res = await axios.get("/api/friends/pending", { withCredentials: true });
      setPendingFriendRequests(res.data.requests || []);
    } catch (err) {
      alert(err.response?.data?.error || "Failed to accept friend request");
    }
  }

  async function handleRejectFriendRequest(requestId) {
    try {
      await axios.post("/api/friends/reject", { request_id: requestId }, { withCredentials: true });
      const res = await axios.get("/api/friends/pending", { withCredentials: true });
      setPendingFriendRequests(res.data.requests || []);
    } catch (err) {
      alert(err.response?.data?.error || "Failed to reject friend request");
    }
  }

  // Handle emoji selection from picker
  const handleEmojiSelect = (emoji) => {
    setNewBody(prev => prev + emoji);
    setShowEmojiPicker(false);
    if (messageInputRef.current) {
      messageInputRef.current.focus();
    }
  };


  // =========================================================================
  // MESSAGE EDITING HANDLERS
  // =========================================================================
  
  // Start editing a message
  const startEditingMessage = (msg) => {
    setEditingMessageId(msg.dm_message_id);
    setEditingBody(msg.content);
    // Scroll edit form into view after render
    setTimeout(() => {
      const editForm = document.querySelector('.msg-edit-form');
      if (editForm) {
        editForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditingBody("");
  };

  // Save edited message
  const saveEditedMessage = async () => {
    if (!editingBody.trim() || !editingMessageId) return;
    
    const messageId = editingMessageId;
    const newContent = editingBody.trim();
    
    // OPTIMISTIC UPDATE: Close edit, play sound, update UI immediately
    const oldMessages = [...messages];
    setMessages(prev => prev.map(msg => 
      msg.dm_message_id === messageId 
        ? { ...msg, content: newContent, edited_at: new Date().toISOString() }
        : msg
    ));
    cancelEditing();
    playMessageSent();
    if (messageInputRef.current) {
      messageInputRef.current.focus();
    }
    
    // Then make API call in background
    try {
      await axios.put("/api/dm/edit", {
        dm_message_id: messageId,
        content: newContent
      }, { withCredentials: true });
    } catch (err) {
      console.error("Failed to edit message:", err);
      // Revert on error
      setMessages(oldMessages);
      alert(err.response?.data?.error || "Failed to edit message");
    }
  };

  const sendMessage = async () => {
    if (!selectedDmId || !newBody.trim() || sending) return;
    
    setSending(true);
    try {
      await axios.post("/api/dm/send", {
        dm_id: selectedDmId,
        content: newBody.trim()
      }, { withCredentials: true });
      
      playMessageSent();
      setNewBody("");
      
      // Mark as read since we're actively sending in this chat
      await axios.post(`/api/dm/${selectedDmId}/mark-read`, {}, { withCredentials: true }).catch(() => {});
      
      const res = await axios.get(`/api/dm/thread?dm_id=${selectedDmId}`, { withCredentials: true });
      let msgs = res.data?.messages || (Array.isArray(res.data) ? res.data : []);
      prevMessageCountRef.current = msgs.length;
      setMessages(msgs);
      
      // Ensure this DM is not marked as unread
      setDmList(prev => prev.map(d => 
        d.dm_id === selectedDmId ? { ...d, has_unread: false } : d
      ));
      
      // Recalculate hasUnreadDms excluding current DM
      setDmList(prev => {
        const anyUnread = prev.some(d => d.dm_id !== selectedDmId && d.has_unread);
        setHasUnreadDms(anyUnread);
        return prev;
      });
    } catch (err) {
      console.error("Send error:", err);
      alert("Failed to send message");
    } finally {
      setSending(false);
      setTimeout(() => messageInputRef.current?.focus(), 50);
    }
  };

  const selectDm = async (dm) => {
    if (dm.dm_id === selectedDmId) return;
    playServerClick();
    setSelectedDmId(dm.dm_id);
    setOtherUsername(dm.other_username || "Unknown");
    setMessages([]);
    prevMessageCountRef.current = 0;
    navigate(`/dm/${dm.dm_id}`, { replace: true });
    setMobileMenuOpen(false); // Close mobile menu after selection
    
    // Mark DM as read
    try {
      await axios.post(`/api/dm/${dm.dm_id}/mark-read`, {}, { withCredentials: true });
      // Update local state to remove unread indicator
      setDmList(prev => prev.map(d => 
        d.dm_id === dm.dm_id ? { ...d, has_unread: false } : d
      ));
      // Recalculate hasUnreadDms
      setHasUnreadDms(prev => {
        const remaining = dmList.filter(d => d.dm_id !== dm.dm_id && d.has_unread);
        return remaining.length > 0;
      });
    } catch (err) {
      console.error("Failed to mark DM as read:", err);
    }
  };

  const handleSelectServer = (serverId) => {
    playLeaveDm();
    setMobileMenuOpen(false); // Close mobile menu

    // Switch to server chat view
    setSelectedServerId(serverId);
    navigate(`/chat/${serverId}`);
  };


  // =========================================================================
  // DM List Context Menu & Drag-Drop Handlers
  // =========================================================================
  
  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => {
      if (dmContextMenu.visible) {
        setDmContextMenu({ ...dmContextMenu, visible: false });
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [dmContextMenu.visible]);

  // Right-click handler for DM items
  const handleDmContextMenu = (e, dm) => {
    e.preventDefault();
    e.stopPropagation();
    setDmContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      dm: dm
    });
  };

  // Pin/Unpin a DM
  const handlePinDm = async () => {
    if (!dmContextMenu.dm) return;
    const dm = dmContextMenu.dm;
    const newPinState = !dm.is_pinned;
    
    try {
      await axios.post("/api/dm/pin", { 
        dm_id: dm.dm_id, 
        is_pinned: newPinState 
      }, { withCredentials: true });
      
      // Update local state
      setDmList(prev => prev.map(d => 
        d.dm_id === dm.dm_id ? { ...d, is_pinned: newPinState } : d
      ));
    } catch (err) {
      console.error("Failed to pin/unpin DM:", err);
      alert("Failed to update pin status");
    }
    
    setDmContextMenu({ ...dmContextMenu, visible: false });
  };

  // Remove (hide) a DM from list
  const handleRemoveDm = async () => {
    if (!dmContextMenu.dm) return;
    const dm = dmContextMenu.dm;
    
    if (!window.confirm(`Remove conversation with ${dm.other_username}? You can start a new DM to restore it.`)) {
      setDmContextMenu({ ...dmContextMenu, visible: false });
      return;
    }
    
    try {
      await axios.post("/api/dm/hide", { 
        dm_id: dm.dm_id 
      }, { withCredentials: true });
      
      // Remove from local state
      setDmList(prev => prev.filter(d => d.dm_id !== dm.dm_id));
      
      // If this was the selected DM, clear selection
      if (selectedDmId === dm.dm_id) {
        setSelectedDmId(null);
        setOtherUsername("");
        setMessages([]);
        navigate("/dm", { replace: true });
      }
    } catch (err) {
      console.error("Failed to remove DM:", err);
      alert("Failed to remove conversation");
    }
    
    setDmContextMenu({ ...dmContextMenu, visible: false });
  };

  // Drag start
  const handleDragStart = (e, dm, section) => {
    setDraggingDm(dm);
    setDragSection(section);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dm.dm_id.toString());
  };

  // Drag over
  const handleDragOver = (e, dm) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDm?.dm_id !== dm.dm_id) {
      setDragOverDm(dm);
    }
  };

  // Drag leave
  const handleDragLeave = (e) => {
    // Only clear if leaving the actual element
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverDm(null);
    }
  };

  // Drop - reorder DMs
  const handleDrop = async (e, targetDm, targetSection) => {
    e.preventDefault();
    
    if (!draggingDm || draggingDm.dm_id === targetDm.dm_id) {
      setDraggingDm(null);
      setDragOverDm(null);
      setDragSection(null);
      return;
    }
    
    // Only allow drag within same section
    const sourceIsPinned = draggingDm.is_pinned;
    const targetIsPinned = targetDm.is_pinned;
    
    if (sourceIsPinned !== targetIsPinned) {
      // Can't drag between pinned and unpinned sections
      setDraggingDm(null);
      setDragOverDm(null);
      setDragSection(null);
      return;
    }
    
    // Reorder logic
    const isPinned = sourceIsPinned;
    const sectionList = dmList.filter(d => d.is_pinned === isPinned);
    const sourceIndex = sectionList.findIndex(d => d.dm_id === draggingDm.dm_id);
    const targetIndex = sectionList.findIndex(d => d.dm_id === targetDm.dm_id);
    
    if (sourceIndex === -1 || targetIndex === -1) {
      setDraggingDm(null);
      setDragOverDm(null);
      setDragSection(null);
      return;
    }
    
    // Create new order
    const newSectionList = [...sectionList];
    newSectionList.splice(sourceIndex, 1);
    newSectionList.splice(targetIndex, 0, draggingDm);
    
    // Assign new sort orders
    const orderField = isPinned ? 'pinned_sort_order' : 'sort_order';
    const updatedList = newSectionList.map((dm, idx) => ({
      ...dm,
      [orderField]: idx
    }));
    
    // Update full list
    const otherSection = dmList.filter(d => d.is_pinned !== isPinned);
    const newFullList = isPinned 
      ? [...updatedList, ...otherSection]
      : [...otherSection, ...updatedList];
    
    // Sort properly
    newFullList.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      if (a.is_pinned) return a.pinned_sort_order - b.pinned_sort_order;
      return a.sort_order - b.sort_order;
    });
    
    setDmList(newFullList);
    
    // Persist to server
    try {
      const orderPayload = updatedList.map(dm => ({
        dm_id: dm.dm_id,
        sort_order: dm.sort_order || 0,
        pinned_sort_order: dm.pinned_sort_order || 0
      }));
      
      await axios.post("/api/dm/reorder", { 
        order: orderPayload 
      }, { withCredentials: true });
    } catch (err) {
      console.error("Failed to save DM order:", err);
    }
    
    setDraggingDm(null);
    setDragOverDm(null);
    setDragSection(null);
  };

  // Drag end (cleanup)
  const handleDragEnd = () => {
    setDraggingDm(null);
    setDragOverDm(null);
    setDragSection(null);
  };

  function toggleProfileMenu() {
    setProfileMenuOpen(!profileMenuOpen);
  }

  async function handleLogout() {
    try {
      await axios.post("/api/auth/logout", {}, { withCredentials: true });
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      navigate("/login");
    } catch (err) {
      console.error("Logout error:", err);
      navigate("/login");
    }
  }

  async function verifyAdminPassword() {
    setAdminPanelError("");
    try {
      const res = await axios.post("/api/admin/verify", { password: adminPassword }, { withCredentials: true });
      if (res.data?.verified) {
        setAdminVerified(true);
        loadUsers();
      }
    } catch (err) {
      setAdminPanelError(err.response?.data?.error || "Verification failed");
    }
  }

  async function loadUsers() {
    try {
      const res = await axios.get("/api/admin/users", { 
        headers: { "X-Admin-Password": adminPassword },
        withCredentials: true 
      });
      if (res.data?.users) {
        setUsers(res.data.users);
      }
    } catch (err) {
      console.error("Failed to load users:", err);
    }
  }

  async function deleteUser(username) {
    if (!window.confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`/api/admin/users/${username}`, {
        headers: { "X-Admin-Password": adminPassword },
        withCredentials: true
      });
      setUsers(users.filter(u => u.username !== username));
    } catch (err) {
      alert(err.response?.data?.error || "Failed to delete user");
    }
  }

  async function resetPassword(username) {
    const newPass = window.prompt(`Enter new password for "${username}":`);
    if (!newPass) return;
    try {
      await axios.post(`/api/admin/users/${username}/reset-password`, 
        { new_password: newPass },
        { headers: { "X-Admin-Password": adminPassword }, withCredentials: true }
      );
      alert("Password reset successfully");
    } catch (err) {
      alert(err.response?.data?.error || "Failed to reset password");
    }
  }

  const handleSelectFriend = async (username) => {
    try {
      const res = await axios.post("/api/dm/start", { other_username: username }, { withCredentials: true });
      setSelectedDmId(res.data.dm_id);
      setOtherUsername(username);
      setMessages([]);
      setFriendsDrawerOpen(false);
      navigate(`/dm/${res.data.dm_id}`, { replace: true });
    } catch (err) {
      console.error("Start DM error:", err);
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`;
  };

  const shouldShowDateSeparator = (msg, prevMsg) => {
    if (!prevMsg) return true;
    const d1 = new Date(msg.created_at).toDateString();
    const d2 = new Date(prevMsg.created_at).toDateString();
    return d1 !== d2;
  };

  if (loading) {
    return (
      <div className="bcord-chat-root">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#9ca3af' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="bcord-chat-root">
      {/* Mobile Menu Toggle */}
      <button 
        className="mobile-menu-toggle"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        aria-label="Toggle menu"
      >
        {mobileMenuOpen ? '✕' : '☰'}
      </button>
      
      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div 
          className="mobile-overlay active"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* TOP BAR */}
      <div className="bcord-chat-topbar">
        <div className="bcord-chat-topbar-left">
          <span className="bcord-chat-topbar-title">My DMs</span>
          
        </div>
        <div className="bcord-chat-topbar-right">
          {/* Notifications Bell */}
          <div className="bcord-invitations-container">
            <button
              className="bcord-invitations-bell-btn"
              onClick={() => setInvitationsOpen(!invitationsOpen)}
              title="Notifications"
            >
              🔔
              {(invitations.length + pendingFriendRequests.length) > 0 && (
                <span className="bcord-invitations-badge">{invitations.length + pendingFriendRequests.length}</span>
              )}
            </button>
            {invitationsOpen && (
              <>
                <div 
                  className="bcord-invitations-overlay"
                  onClick={() => setInvitationsOpen(false)}
                />
                <div className="bcord-invitations-panel">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0 }}>Notifications</h3>
                    <button
                      onClick={() => setInvitationsOpen(false)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#9ca3af',
                        fontSize: '20px',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        lineHeight: '1'
                      }}
                      title="Close"
                    >
                      ×
                    </button>
                  </div>

                  {/* Server Invitations Section */}
                  <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase' }}>Server Invitations</h4>
                    {invitations.length === 0 ? (
                      <p className="bcord-no-invitations" style={{ margin: '4px 0' }}>No pending server invitations</p>
                    ) : (
                      <div className="bcord-invitations-list">
                        {invitations.map((inv) => (
                          <div key={inv.server_id} className="bcord-invitation-item">
                            <div className="bcord-invitation-info">
                              <div className="bcord-invitation-server">{inv.server_name}</div>
                              <div className="bcord-invitation-from">from {inv.inviter}</div>
                            </div>
                            <div className="bcord-invitation-actions">
                              <button
                                className="bcord-invitation-accept"
                                onClick={() => handleAcceptInvitation(inv.id, inv.server_id)}
                              >
                                ✓
                              </button>
                              <button
                                className="bcord-invitation-decline"
                                onClick={() => handleDeclineInvitation(inv.id)}
                              >
                                ✗
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Friend Requests Section */}
                  <div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase' }}>Friend Requests</h4>
                    {pendingFriendRequests.length === 0 ? (
                      <p className="bcord-no-invitations" style={{ margin: '4px 0' }}>No pending friend requests</p>
                    ) : (
                      <div className="bcord-invitations-list">
                        {pendingFriendRequests.map((req) => (
                          <div key={req.id} className="bcord-invitation-item">
                            <div className="bcord-invitation-info">
                              <div className="bcord-invitation-server">{req.username}</div>
                              <div className="bcord-invitation-from">wants to be friends</div>
                            </div>
                            <div className="bcord-invitation-actions">
                              <button
                                className="bcord-invitation-accept"
                                onClick={() => handleAcceptFriendRequest(req.id, req.username)}
                              >
                                ✓
                              </button>
                              <button
                                className="bcord-invitation-decline"
                                onClick={() => handleRejectFriendRequest(req.id)}
                              >
                                ✗
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* MAIN BODY - Same grid as ChatPage */}
      <div 
        className="bcord-chat-body"
        style={{
          gridTemplateColumns: rumbleCollapsed 
            ? `${leftSectionWidth}px minmax(0, 1fr) 0px`
            : `${leftSectionWidth}px minmax(0, 1fr) 260px`
        }}
      >
        {/* LEFT SECTION */}
        <div className={`bcord-left-section ${mobileMenuOpen ? 'mobile-open' : ''}`} style={{ width: `${leftSectionWidth}px` }}>
          <div className="resize-handle resize-handle-right" onMouseDown={handleResizeStart} />
          <div className="bcord-left-content">
            {/* SERVER RAIL */}
            <div className="bcord-chat-col bcord-chat-rail">
              <div className="bcord-chat-rail-top">
                {/* DM Button - Active since we're on DM page */}
                <div 
                  className="bcord-chat-rail-server active"
                  onClick={() => {}}
                  style={{ cursor: 'default' }}
                  title="Direct Messages"
                >
                  <div className="initials">DM</div>
                  {hasUnreadDms && <div className="dm-notification-dot"></div>}
                </div>
                
                <div className="bcord-chat-rail-top-divider" />
                
                {/* Server List */}
                {servers.map((server) => (
                  <button
                    key={server.id}
                    className="bcord-chat-rail-room"
                    onClick={() => handleSelectServer(server.id)}
                    title={server.name}
                  >
                    <div className="initials">{server.initials}</div>
                    {unreadServers[server.id] && <div className="server-unread-dot" />}
                  </button>
                ))}
                
                <button
                  className="bcord-chat-rail-room add-server"
                  onClick={() => navigate("/chat")}
                  title="Back to Chat"
                >
                  <div className="initials">+</div>
                </button>
              </div>
            </div>

            {/* DM LIST (instead of channels) */}
            <div className="bcord-chat-col bcord-chat-rooms">
              <div className="bcord-chat-rooms-header">
                <div className="bcord-chat-rooms-title">CONVERSATIONS</div>
              </div>
              <div className="bcord-chat-rooms-list">
                {dmList.length === 0 ? (
                  <div style={{ padding: '16px', color: '#6b7280', fontSize: '13px', textAlign: 'center' }}>
                    No conversations yet
                  </div>
                ) : (
                  <>
                    {/* Pinned Section */}
                    {dmList.some(dm => dm.is_pinned) && (
                      <>
                        <div className="dm-section-header">📌 PINNED</div>
                        {dmList.filter(dm => dm.is_pinned).sort((a,b) => (a.pinned_sort_order || 0) - (b.pinned_sort_order || 0)).map((dm) => (
                          <div
                            key={dm.dm_id}
                            className={`bcord-chat-room-item ${selectedDmId === dm.dm_id ? 'active' : ''} ${draggingDm?.dm_id === dm.dm_id ? 'dragging' : ''} ${dragOverDm?.dm_id === dm.dm_id ? 'drag-over' : ''}`}
                            onClick={() => selectDm(dm)}
                            onContextMenu={(e) => handleDmContextMenu(e, dm)}
                            draggable
                            onDragStart={(e) => handleDragStart(e, dm, 'pinned')}
                            onDragOver={(e) => handleDragOver(e, dm)}
                            onDragEnd={handleDragEnd}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, dm)}
                          >
                            <div className="bcord-chat-room-content">
                              {dm.has_unread && selectedDmId !== dm.dm_id && <span className="dm-user-unread-dot" />}
                              <span className="hash">📌</span>
                              <span className="label">{dm.other_username || "Unknown"}</span>
                              {onlineUsers.includes(dm.other_username) && (
                                <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#22c55e', borderRadius: '50%', marginLeft: '6px' }} />
                              )}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                    
                    {/* Normal Section */}
                    {dmList.some(dm => !dm.is_pinned) && (
                      <>
                        {dmList.some(dm => dm.is_pinned) && <div className="dm-section-header">💬 ALL MESSAGES</div>}
                        {dmList.filter(dm => !dm.is_pinned).sort((a,b) => (a.sort_order || 0) - (b.sort_order || 0)).map((dm) => (
                          <div
                            key={dm.dm_id}
                            className={`bcord-chat-room-item ${selectedDmId === dm.dm_id ? 'active' : ''} ${draggingDm?.dm_id === dm.dm_id ? 'dragging' : ''} ${dragOverDm?.dm_id === dm.dm_id ? 'drag-over' : ''}`}
                            onClick={() => selectDm(dm)}
                            onContextMenu={(e) => handleDmContextMenu(e, dm)}
                            draggable
                            onDragStart={(e) => handleDragStart(e, dm, 'normal')}
                            onDragOver={(e) => handleDragOver(e, dm)}
                            onDragEnd={handleDragEnd}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, dm)}
                          >
                            <div className="bcord-chat-room-content">
                              {dm.has_unread && selectedDmId !== dm.dm_id && <span className="dm-user-unread-dot" />}
                              <span className="hash">@</span>
                              <span className="label">{dm.other_username || "Unknown"}</span>
                              {onlineUsers.includes(dm.other_username) && (
                                <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#22c55e', borderRadius: '50%', marginLeft: '6px' }} />
                              )}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* USER PANEL */}
          <div className="bcord-user-panel">
            <div className="bcord-user-panel-info">
              <div 
                className="bcord-user-panel-avatar" 
                title={`${currentUser} - Click for menu`}
                onClick={toggleProfileMenu}
                style={{ cursor: 'pointer' }}
              >
                {userInitials}
                <span className="bcord-user-panel-status-dot" />
              </div>
              <div className="bcord-user-panel-details">
                <div className="bcord-user-panel-username">{currentUser}</div>
                <div className="bcord-user-panel-status">Online</div>
              </div>
            </div>
            <div className="bcord-user-panel-controls">
              <button className="bcord-user-panel-btn" title="Microphone">🎤</button>
              <button className="bcord-user-panel-btn" title="Headphones">🎧</button>
              <button className="bcord-user-panel-btn" title="Settings">⚙️</button>
            </div>
          </div>
        </div>

        {/* MAIN CHAT AREA */}
        <div className="bcord-chat-col bcord-chat-main">
          <div className="bcord-chat-main-header">
            <div className="bcord-chat-main-room">
              <span className="hash">@</span>
              <span>{otherUsername || 'Select a conversation'}</span>
              {otherUsername && onlineUsers.includes(otherUsername) && (
                <span style={{ color: '#22c55e', fontSize: '12px', marginLeft: '8px' }}>● Online</span>
              )}
            </div>
          </div>

          <div className="bcord-chat-messages">
            {!selectedDmId ? (
              <div className="bcord-chat-empty">Select a conversation to start messaging</div>
            ) : messages.length === 0 ? (
              <div className="bcord-chat-empty">No messages yet. Say hi to {otherUsername}!</div>
            ) : (
              messages.map((msg, index) => (
                <React.Fragment key={msg.dm_message_id || index}>
                  {shouldShowDateSeparator(msg, messages[index - 1]) && (
                    <div className="bcord-chat-date-separator">
                      <span className="bcord-chat-date-line"></span>
                      <span className="bcord-chat-date-text">{formatDate(msg.created_at)}</span>
                      <span className="bcord-chat-date-line"></span>
                    </div>
                  )}
                  <div className="bcord-chat-message">
                    <div className="bcord-chat-message-avatar">
                      {(msg.sender_username || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="bcord-chat-message-body">
                      <div className="bcord-chat-message-meta">
                        <span className="sender">{msg.sender_username}</span>
                        <span className="time">{formatTime(msg.created_at)}</span>
                        {msg.edited_at && <span className="edited-indicator">(edited)</span>}
                        {msg.sender_username === currentUser && editingMessageId !== msg.dm_message_id && (
                          <button 
                            className="msg-edit-btn"
                            onClick={() => startEditingMessage(msg)}
                            title="Edit message"
                          >
                            ✏️
                          </button>
                        )}
                      </div>
                      {editingMessageId === msg.dm_message_id ? (
                        <div className="msg-edit-form">
                          <textarea
                            className="msg-edit-textarea"
                            value={editingBody}
                            onChange={(e) => setEditingBody(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                saveEditedMessage();
                              }
                              if (e.key === 'Escape') {
                                cancelEditing();
                              }
                            }}
                            autoFocus
                          />
                          <div className="msg-edit-hint-inline">press enter to save • escape to cancel</div>
                        </div>
                      ) : (
                        <ExpandableMessage content={msg.content} />
                      )}
                    </div>
                  </div>
                </React.Fragment>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {selectedDmId && (
            <div className="bcord-chat-composer">
              {/* Emoji Picker Popup */}
              {showEmojiPicker && (
                <EmojiPicker 
                  onSelect={handleEmojiSelect}
                  onClose={() => setShowEmojiPicker(false)}
                />
              )}
              
              {/* Emoji Toggle Button */}
              <button 
                className="emoji-toggle-btn"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                title="Add emoji"
              >
                😀
              </button>
              
              <textarea
                ref={messageInputRef}
                className="bcord-chat-input"
                value={newBody}
                onChange={(e) => {
                  setNewBody(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                    e.target.style.height = 'auto';
                  }
                }}
                placeholder={`Message @${otherUsername}`}
                rows={1}
                
              />
              <button className="bcord-chat-send-btn" onClick={sendMessage} disabled={sending || !newBody.trim()}>
                {sending ? "..." : "Send"}
              </button>
            </div>
          )}
        </div>

        {/* RUMBLE COLLAPSE BUTTON */}
        <div 
          className={`rumble-collapse-btn ${rumbleCollapsed ? 'collapsed' : ''}`}
          onClick={() => setRumbleCollapsed(!rumbleCollapsed)}
          title={rumbleCollapsed ? "Show Rumble Lineup" : "Hide Rumble Lineup"}
        />

        {/* RUMBLE SIDEBAR */}
        <div className={`bcord-chat-col bcord-chat-rumble ${rumbleCollapsed ? 'rumble-collapsed' : ''}`}>
          <div className="bcord-chat-rumble-header">
            <div className="bcord-chat-rumble-title">RUMBLE LINEUP</div>
          </div>
          <div className="bcord-chat-rumble-list">
            {rumbleVideos.length === 0 ? (
              <div className="bcord-chat-rumble-loading">Loading...</div>
            ) : (
              rumbleVideos.map((video, index) => (
                <a 
                  key={index}
                  href={video.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`bcord-chat-rumble-item ${video.isLive ? 'is-live' : ''}`}
                >
                  {video.thumbnail && (
                    <img 
                      src={video.thumbnail} 
                      alt=""
                      className="rumble-thumbnail"
                      referrerPolicy="no-referrer"
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  )}
                  <div className="rumble-info">
                    <div className="title">
                      {video.isLive && <span className="live-badge">LIVE</span>}
                      {video.title}
                    </div>
                    <div className="host">{video.channel}</div>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Profile Menu Popup */}
      {profileMenuOpen && (
        <div className="profile-menu-overlay" onClick={() => setProfileMenuOpen(false)}>
          <div className="profile-menu-popup" onClick={(e) => e.stopPropagation()}>
            <div className="profile-menu-header">
              <div className="profile-avatar-large">
                {userInitials}
              </div>
              <div className="profile-info">
                <div className="profile-username">{currentUser}</div>
                <div className="profile-status">Online</div>
              </div>
            </div>
            
            <div className="profile-menu-divider"></div>
            
            <div className="profile-menu-items">
              <button className="profile-menu-item">
                <span className="icon">👤</span>
                <span className="label">My Profile</span>
              </button>
              <button className="profile-menu-item">
                <span className="icon">⚙️</span>
                <span className="label">Settings</span>
              </button>
              <button className="profile-menu-item">
                <span className="icon">🔒</span>
                <span className="label">Privacy</span>
              </button>
              <button 
                className="profile-menu-item" 
                onClick={() => {
                  setProfileMenuOpen(false);
                  setShowFriendsModal(true);
                }}
              >
                <span className="icon">👥</span>
                <span className="label">Friends</span>
              </button>
              {isAdmin && (
                <button 
                  className="profile-menu-item" 
                  onClick={() => {
                    setProfileMenuOpen(false);
                    setAdminPanelOpen(true);
                  }}
                >
                  <span className="icon">👑</span>
                  <span className="label">Admin</span>
                </button>
              )}
            </div>
            
            <div className="profile-menu-divider"></div>
            
            <button className="profile-menu-item logout" onClick={handleLogout}>
              <span className="icon">🚪</span>
              <span className="label">Log Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Admin Panel Modal */}
      {adminPanelOpen && (
        <div className="admin-panel-overlay" onClick={() => { setAdminPanelOpen(false); setAdminVerified(false); setAdminPassword(""); }}>
          <div className="admin-panel-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-panel-header">
              <h2>🔐 Admin Access</h2>
              <button className="admin-panel-close" onClick={() => { setAdminPanelOpen(false); setAdminVerified(false); setAdminPassword(""); }}>×</button>
            </div>
            
            {!adminVerified ? (
              <div className="admin-verify-form">
                <p>Enter the admin password to access the user management panel.</p>
                <label>Admin Password</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && verifyAdminPassword()}
                  placeholder="Enter admin password"
                />
                {adminPanelError && <div className="admin-error">{adminPanelError}</div>}
                <div className="admin-verify-buttons">
                  <button className="admin-btn-cancel" onClick={() => { setAdminPanelOpen(false); setAdminPassword(""); }}>Cancel</button>
                  <button className="admin-btn-verify" onClick={verifyAdminPassword}>Verify</button>
                </div>
              </div>
            ) : (
              <div className="admin-users-panel">
                <h3>User Management</h3>
                <div className="admin-users-list">
                  {users.map((user) => (
                    <div key={user.username} className="admin-user-row">
                      <div className="admin-user-info">
                        <span className="admin-user-name">{user.username}</span>
                        <span className="admin-user-email">{user.email}</span>
                      </div>
                      <div className="admin-user-actions">
                        <button onClick={() => resetPassword(user.username)}>Reset Password</button>
                        <button className="danger" onClick={() => deleteUser(user.username)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Friends Modal */}
      <FriendsModal 
        isOpen={showFriendsModal} 
        onClose={() => setShowFriendsModal(false)} 
      />

      {/* DM Context Menu */}
      {dmContextMenu.visible && (
        <div 
          className="dm-context-menu"
          style={{ 
            position: 'fixed', 
            top: dmContextMenu.y, 
            left: dmContextMenu.x,
            zIndex: 10001
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="context-menu-item" onClick={handlePinDm}>
            {dmContextMenu.dm?.is_pinned ? '📌 Unpin' : '📌 Pin to Top'}
          </button>
          <button className="context-menu-item context-menu-danger" onClick={handleRemoveDm}>
            ❌ Remove from DMs
          </button>
        </div>
      )}
    </div>
  );
}

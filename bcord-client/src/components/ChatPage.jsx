import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import useTokenRefresher from "../hooks/useTokenRefresher";
import AdminPanel from "./AdminPanel";
import { playInviteChime, playNewMessage, playServerJoined, playMessageSent, playUserOnline, playDoorbellDingDong } from "../utils/sounds";

export default function ChatPage() {
  const navigate = useNavigate();
  
  // Auto-refresh access token every 10 minutes
  useTokenRefresher(10);
  
  // Servers (loaded from backend)
  const [servers, setServers] = useState([]);
  const [selectedServerId, setSelectedServerId] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState("general");
  
  // State
  const [messages, setMessages] = useState([]);
  const [newBody, setNewBody] = useState("");
  const [friendsDrawerOpen, setFriendsDrawerOpen] = useState(false);
  const [friends, setFriends] = useState([]);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [createServerModalOpen, setCreateServerModalOpen] = useState(false);
  const [createChannelModalOpen, setCreateChannelModalOpen] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [currentUser, setCurrentUser] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [sessionWarning, setSessionWarning] = useState(false);
  const [deleteChannelConfirm, setDeleteChannelConfirm] = useState(null);
  const [deleteServerConfirm, setDeleteServerConfirm] = useState(null);
  const [leaveServerConfirm, setLeaveServerConfirm] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [invitationsOpen, setInvitationsOpen] = useState(false);
  const [inviteUserModalOpen, setInviteUserModalOpen] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [selectedFriendsToInvite, setSelectedFriendsToInvite] = useState([]);
  const [currentServerMembers, setCurrentServerMembers] = useState([]);
  const [rumbleCollapsed, setRumbleCollapsed] = useState(false);
  const [rumbleVideos, setRumbleVideos] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [hasUnreadDms, setHasUnreadDms] = useState(false);
  const [unreadDmUsers, setUnreadDmUsers] = useState({}); // { username: true/false }
  const [unreadServers, setUnreadServers] = useState({}); // { serverId: true/false }
  const [unreadChannels, setUnreadChannels] = useState({}); // { "serverId-channelName": true/false }
  const [leftSectionWidth, setLeftSectionWidth] = useState(210);
  
  const messagesEndRef = useRef(null);
  const resizingRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const userSentMessageRef = useRef(false);
  const prevMessageCountRef = useRef(0);
  const lastMessageIdRef = useRef(null);
  const friendsDrawerRef = useRef(null);
  const channelIdCache = useRef({}); // Cache: "serverId-channelName" -> channelId
  const markReadInFlight = useRef(new Set()); // Track in-flight mark-read requests
  const messageInputRef = useRef(null);
  const prevOnlineUsersRef = useRef([]);
  const prevDmListRef = useRef([]);
  const scrollTimerRef = useRef(null);
  const isUserScrolledUpRef = useRef(false);
  
  // Track the authenticated user identity for session validation
  const authenticatedUserRef = useRef(null);

  // Get current server and its channels
  const currentServer = servers.find(s => s.id === selectedServerId);
  const currentChannels = currentServer?.channels || ["general"];

  // Format timestamp to time only (HH:MM AM/PM)
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minutesStr} ${ampm}`;
  };

  // Format date for separator (MM/dd/yyyy)
  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

  // Check if message is on a different day than previous message
  const shouldShowDateSeparator = (currentMsg, prevMsg) => {
    if (!prevMsg) return true;
    const currentDate = new Date(currentMsg.created_at).toDateString();
    const prevDate = new Date(prevMsg.created_at).toDateString();
    return currentDate !== prevDate;
  };

  // Verify current session matches expected user
  const verifySession = useCallback(async () => {
    try {
      const res = await axios.get("/api/profile", {
        withCredentials: true,
      });
      
      const serverUser = res.data?.user;
      
      if (!serverUser) {
        // No user - session expired
        console.warn("[Session] No user in response - session expired");
        navigate("/login");
        return false;
      }
      
      // Check if the authenticated user changed (session hijack/crossover)
      if (authenticatedUserRef.current && authenticatedUserRef.current !== serverUser) {
        console.error(
          `[Session] CRITICAL: User identity changed from "${authenticatedUserRef.current}" to "${serverUser}"!`
        );
        setSessionWarning(true);
        
        // Force logout to prevent session crossover
        setTimeout(() => {
          navigate("/login");
        }, 3000);
        
        return false;
      }
      
      return true;
    } catch (err) {
      console.error("[Session] Verification failed:", err);
      navigate("/login");
      return false;
    }
  }, [navigate]);

  // Load user from /api/profile and check admin status
  useEffect(() => {
    async function loadUser() {
      try {
        const res = await axios.get("/api/profile", {
          withCredentials: true,
        });
        
        if (res.data && res.data.user) {
          const username = res.data.user;
          
          // Store the authenticated user identity for session validation
          authenticatedUserRef.current = username;
          setCurrentUser(username);
          
          console.log(`[Session] Authenticated as: ${username}`);
          
          // Check if user is admin by trying to access admin endpoint
          try {
            await axios.get("/api/admin/users", { withCredentials: true });
            setIsAdmin(true);
          } catch {
            setIsAdmin(false);
          }
        } else {
          // No user in response - redirect to login
          console.error("No user in profile response - redirecting to login");
          navigate("/login");
        }
      } catch (err) {
        console.error("Failed to load user - redirecting to login:", err);
        // Authentication failed - redirect to login
        navigate("/login");
      }
    }
    loadUser();
  }, [navigate]);


  // Invitation handlers
  async function handleInviteUser() {
    if (!selectedServerId) return;
    
    // Collect all usernames to invite (from text input + selected friends)
    const usersToInvite = [...selectedFriendsToInvite];
    if (inviteUsername.trim() && !usersToInvite.includes(inviteUsername.trim())) {
      usersToInvite.push(inviteUsername.trim());
    }
    
    if (usersToInvite.length === 0) {
      alert("Please enter a username or select friends to invite");
      return;
    }
    
    const results = { success: [], failed: [] };
    
    for (const username of usersToInvite) {
      try {
        await axios.post(`/api/servers/${selectedServerId}/invite`, {
          username: username
        }, {
          withCredentials: true,
        });
        results.success.push(username);
      } catch (err) {
        results.failed.push({ username, error: err.response?.data?.error || "Failed" });
      }
    }
    
    // Show results
    if (results.success.length > 0 && results.failed.length === 0) {
      alert(`Invitation${results.success.length > 1 ? 's' : ''} sent to: ${results.success.join(', ')}`);
    } else if (results.success.length > 0 && results.failed.length > 0) {
      alert(`Sent to: ${results.success.join(', ')}\nFailed: ${results.failed.map(f => f.username + ' (' + f.error + ')').join(', ')}`);
    } else {
      alert(`Failed to invite: ${results.failed.map(f => f.username + ' (' + f.error + ')').join(', ')}`);
    }
    
    setInviteUserModalOpen(false);
    setInviteUsername("");
    setSelectedFriendsToInvite([]);
  }
  
  function toggleFriendForInvite(username) {
    setSelectedFriendsToInvite(prev => {
      if (prev.includes(username)) {
        return prev.filter(u => u !== username);
      } else {
        return [...prev, username];
      }
    });
  }
  
  async function loadServerMembers(serverId) {
    if (!serverId) return;
    try {
      const res = await axios.get(`/api/servers/${serverId}/members`, {
        withCredentials: true,
      });
      const memberUsernames = (res.data.members || []).map(m => m.username);
      setCurrentServerMembers(memberUsernames);
    } catch (err) {
      console.error("Failed to load server members:", err);
      setCurrentServerMembers([]);
    }
  }
  // Fetch unread status for all servers
  async function fetchUnreadStatus() {
    try {
      const serverUnreadMap = {};
      const channelUnreadMap = {};
      
      for (const server of servers) {
        try {
          const res = await axios.get(`/api/servers/${server.id}/unread`, {
            withCredentials: true,
          });
          
          let serverHasUnread = false;
          
          // Track channel-level unread
          if (res.data.channels) {
            res.data.channels.forEach(ch => {
              const key = `${server.id}-${ch.channel_name}`;
              
              // If user is currently viewing this channel, treat it as read
              const isCurrentlyViewing = server.id === selectedServerId && ch.channel_name === selectedChannel;
              const hasUnread = isCurrentlyViewing ? false : (ch.has_unread || false);
              
              channelUnreadMap[key] = hasUnread;
              
              // Server has unread if ANY channel (except currently viewed) has unread
              if (hasUnread) {
                serverHasUnread = true;
              }
            });
          }
          
          // Track server-level unread (recalculated based on channels, excluding current)
          serverUnreadMap[server.id] = serverHasUnread;
          
        } catch (err) {
          console.error(`Failed to fetch unread for server ${server.id}:`, err);
        }
      }
      
      setUnreadServers(serverUnreadMap);
      setUnreadChannels(channelUnreadMap);
    } catch (err) {
      console.error("Failed to fetch unread status:", err);
    }
  }
  // Mark a channel as read
  // Mark a channel as read - optimized: uses cache, non-blocking, deduped
  function markChannelAsRead(channelName, serverId) {
    if (!serverId || !channelName) return;
    
    const cacheKey = `${serverId}-${channelName}`;
    
    // Check if already in flight
    if (markReadInFlight.current.has(cacheKey)) return;
    
    // Get channel ID from cache
    const channelId = channelIdCache.current[cacheKey];
    if (!channelId) {
      // If not in cache, we can't mark as read yet (channels will load and cache soon)
      console.debug(`Channel ID not cached for ${cacheKey}, skipping mark-read`);
      return;
    }
    
    // Mark as in-flight
    markReadInFlight.current.add(cacheKey);
    
    // Update local state immediately (optimistic)
    setUnreadChannels(prev => ({...prev, [cacheKey]: false}));
    
    // Check if server still has any unread channels
    const server = servers.find(s => s.id === serverId);
    if (server) {
      const hasOtherUnread = server.channels?.some(ch => {
        const key = `${serverId}-${ch}`;
        return ch !== channelName && unreadChannels[key];
      });
      if (!hasOtherUnread) {
        setUnreadServers(prev => ({...prev, [serverId]: false}));
      }
    }
    
    // Fire and forget the API call (non-blocking)
    axios.post(`/api/channels/${channelId}/mark-read`, {}, {
      withCredentials: true,
    })
    .catch(err => {
      console.error("Failed to mark channel as read:", err);
      // Optionally revert optimistic update on error
      // setUnreadChannels(prev => ({...prev, [cacheKey]: true}));
    })
    .finally(() => {
      markReadInFlight.current.delete(cacheKey);
    });
  }
  async function handleAcceptInvitation(serverId) {
    try {
      await axios.post(`/api/invitations/${serverId}/accept`, {}, {
        withCredentials: true,
      });
      playServerJoined();
      // Reload servers to show the newly accepted server
      const res = await axios.get("/api/servers/list", {
        withCredentials: true,
      });
      
      if (res.data && res.data.servers) {
        const serversWithChannels = await Promise.all(
          res.data.servers.map(async (server) => {
            try {
              const channelsRes = await axios.get(`/api/servers/${server.id}/channels`, {
                withCredentials: true,
              });
              return {
                ...server,
                channels: channelsRes.data.channels.map(ch => { channelIdCache.current[`${server.id}-${ch.name}`] = ch.id; return ch.name; })
              };
            } catch (err) {
              return {
                ...server,
                channels: ["general"]
              };
            }
          })
        );
        setServers(serversWithChannels);
      }
      
      // Reload invitations
      const invRes = await axios.get("/api/invitations", {
        withCredentials: true,
      });
      setInvitations(invRes.data.invitations || []);
      
      // Switch to the newly accepted server
      setSelectedServerId(serverId);
      setInvitationsOpen(false);
    } catch (err) {
      alert(err.response?.data?.error || "Failed to accept invitation");
    }
  }

  async function handleDeclineInvitation(serverId) {
    try {
      await axios.post(`/api/invitations/${serverId}/decline`, {}, {
        withCredentials: true,
      });
      // Reload invitations
      const invRes = await axios.get("/api/invitations", {
        withCredentials: true,
      });
      setInvitations(invRes.data.invitations || []);
    } catch (err) {
      alert(err.response?.data?.error || "Failed to decline invitation");
    }
  }

  // Resize handlers
  const handleResizeStart = (e) => {
    resizingRef.current = 'left-section';
    e.preventDefault();
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = (e) => {
    if (resizingRef.current === 'left-section') {
      const newWidth = Math.max(200, Math.min(500, e.clientX));
      setLeftSectionWidth(newWidth);
    }
  };

  const handleResizeEnd = () => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  };

  // Load servers from backend on mount
  useEffect(() => {
    async function loadServers() {
      try {
        const res = await axios.get("/api/servers/list", {
          withCredentials: true,
        });
        
        if (res.data && res.data.servers) {
          // For each server, load its channels
          const serversWithChannels = await Promise.all(
            res.data.servers.map(async (server) => {
              try {
                const channelsRes = await axios.get(`/api/servers/${server.id}/channels`, {
                  withCredentials: true,
                });
                return {
                  ...server,
                  channels: channelsRes.data.channels.map(ch => { channelIdCache.current[`${server.id}-${ch.name}`] = ch.id; return ch.name; })
                };
              } catch (err) {
                console.error(`Failed to load channels for server ${server.id}:`, err);
                return {
                  ...server,
                  channels: ["general"]
                };
              }
            })
          );
          
          setServers(serversWithChannels);
          
          // Select first server by default
          if (serversWithChannels.length > 0) {
            setSelectedServerId(serversWithChannels[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load servers:", err);
        // If backend fails, still show default server (might be new user)
      }
    }

    // Fetch pending invitations
    async function fetchInvitations() {
      try {
        const resp = await axios.get("/api/invitations", {
          withCredentials: true,
        });
        const newInvites = resp.data.invitations || [];
        setInvitations(prev => {
          if (newInvites.length > prev.length) {
            playInviteChime();
          }
          return newInvites;
        });
      } catch (err) {
        console.error("Failed to fetch invitations:", err);
      }
    }


    loadServers();
    fetchInvitations();
  }, []);

  // Auto-scroll logic
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Reset 5-minute auto-scroll timer
  const resetScrollTimer = () => {
    if (scrollTimerRef.current) {
      clearTimeout(scrollTimerRef.current);
    }
    scrollTimerRef.current = setTimeout(() => {
      scrollToBottom();
      isUserScrolledUpRef.current = false;
    }, 5 * 60 * 1000); // 5 minutes
  };

  // Handle user scroll
  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    
    // Check if user is near bottom (within 100px)
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    
    if (!isNearBottom) {
      isUserScrolledUpRef.current = true;
      resetScrollTimer();
    } else {
      isUserScrolledUpRef.current = false;
    }
  };

  // Scroll on message changes
  useEffect(() => {
    // Only auto-scroll if user sent the message
    if (userSentMessageRef.current) {
      scrollToBottom();
      userSentMessageRef.current = false;
      isUserScrolledUpRef.current = false;
    }
    // If user hasn't scrolled up, also scroll for new messages
    else if (!isUserScrolledUpRef.current) {
      scrollToBottom();
    }
  }, [messages]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }
    };
  }, []);
  // Load messages for current server + channel
  async function loadMessages(channel, serverId) {
    if (!serverId) return;
    
    try {
      const res = await axios.get(
        `/api/history?server_id=${serverId}&channel=${channel}&limit=100`,
        { withCredentials: true }
      );
      const msgs = res.data.reverse();
      
      // Detect new messages from other users
      if (msgs.length > 0) {
        const latestMsg = msgs[msgs.length - 1];
        const latestMsgId = latestMsg.id || latestMsg.created_at;
        
        // If we have a previous message ID and the latest is different
        if (lastMessageIdRef.current && latestMsgId !== lastMessageIdRef.current) {
          // Check if the new message is from someone else
          if (latestMsg.username !== currentUser && !userSentMessageRef.current) {
            playNewMessage();
          }
        }
        lastMessageIdRef.current = latestMsgId;
      }
      userSentMessageRef.current = false;
      
      setMessages(msgs);
      
    } catch (err) {
      console.error("Load messages error:", err);
      // If server doesn't exist (400/404/500), remove it from state
      const status = err?.response?.status;
      if (status === 400 || status === 404 || status === 500) {
        console.warn(`Server ${serverId} may have been deleted, removing from list`);
        setServers(prev => {
          const updated = prev.filter(s => s.id !== serverId);
          if (selectedServerId === serverId && updated.length > 0) {
            setSelectedServerId(updated[0].id);
            setSelectedChannel(updated[0].channels?.[0] || "general");
          } else if (updated.length === 0) {
            setSelectedServerId(null);
          }
          return updated;
        });
      }
    }
  }

  // Message polling with session verification
  useEffect(() => {
    if (!selectedServerId) return;
    
    // Initial load
    loadMessages(selectedChannel, selectedServerId);
    
    // Counter for session verification (verify every 5th poll = every 15 seconds)
    let pollCount = 0;
    
    const id = setInterval(async () => {
      pollCount++;
      
      // Verify session every 5 polls (15 seconds)
      if (pollCount >= 5) {
        pollCount = 0;
        const sessionValid = await verifySession();
        if (!sessionValid) {
          clearInterval(id);
          return;
        }
      }
      
      loadMessages(selectedChannel, selectedServerId);
    }, 3000);
    
    return () => clearInterval(id);
  }, [selectedChannel, selectedServerId, verifySession]);

  // Fetch Rumble lineup on mount and every 5 minutes
  useEffect(() => {
    const fetchRumbleLineup = async () => {
      try {
        const res = await axios.get('/api/rumble/lineup');
        if (res.data && res.data.lineup) {
          // Transform lineup data to match our display format
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
    
    fetchRumbleLineup();
    const interval = setInterval(fetchRumbleLineup, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, []);

  // Poll invitations every 5 seconds for real-time bell notifications
  useEffect(() => {
    const pollInvitations = async () => {
      try {
        const resp = await axios.get("/api/invitations", {
          withCredentials: true,
        });
        const newInvites = resp.data.invitations || [];
        setInvitations(prev => {
          if (newInvites.length > prev.length) {
            playInviteChime();
          }
          return newInvites;
        });
      } catch (err) {
        // Silently fail - dont spam console
      }
    };
    
    const interval = setInterval(pollInvitations, 5000); // 5 seconds
    return () => clearInterval(interval);
  }, []);

  // Poll servers list every 10 seconds to detect new servers (from accepted invitations elsewhere)
  useEffect(() => {
    const pollServers = async () => {
      try {
        const res = await axios.get("/api/servers/list", {
          withCredentials: true,
        });
        
        if (res.data && res.data.servers) {
          // Check if server list changed
          const newServerIds = res.data.servers.map(s => s.id).sort().join(",");
          const currentServerIds = servers.map(s => s.id).sort().join(",");
          
          if (newServerIds !== currentServerIds) {
            // Server list changed - reload with channels
            const serversWithChannels = await Promise.all(
              res.data.servers.map(async (server) => {
                try {
                  const channelsRes = await axios.get(`/api/servers/${server.id}/channels`, {
                    withCredentials: true,
                  });
                  return {
                    ...server,
                    channels: channelsRes.data.channels.map(ch => { channelIdCache.current[`${server.id}-${ch.name}`] = ch.id; return ch.name; })
                  };
                } catch (err) {
                  return {
                    ...server,
                    channels: ["general"]
                  };
                }
              })
            );
            
            setServers(serversWithChannels);
            
            // If no server selected and we have servers, select the first one
            if (!selectedServerId && serversWithChannels.length > 0) {
              setSelectedServerId(serversWithChannels[0].id);
            }
          }
        }
      } catch (err) {
        // Silently fail - dont spam console
      }
    };
    
    const interval = setInterval(pollServers, 10000); // 10 seconds
    return () => clearInterval(interval);
  }, [servers, selectedServerId]);

  // Poll channels for current server every 5 seconds for real-time updates
  useEffect(() => {
    if (!selectedServerId) return;
    
    const pollChannels = async () => {
      try {
        const channelsRes = await axios.get(`/api/servers/${selectedServerId}/channels`, {
          withCredentials: true,
        });
        
        const newChannels = channelsRes.data.channels.map(ch => { channelIdCache.current[`${selectedServerId}-${ch.name}`] = ch.id; return ch.name; });
        
        // Update servers channels in state (only if changed to avoid re-renders)
        setServers(prevServers => {
          const currentServer = prevServers.find(s => s.id === selectedServerId);
          if (!currentServer) return prevServers;
          
          // Check if channels actually changed
          const currentChannelList = currentServer.channels || [];
          if (JSON.stringify(currentChannelList) === JSON.stringify(newChannels)) {
            return prevServers; // No change
          }
          
          // Channels changed - update
          return prevServers.map(s => 
            s.id === selectedServerId 
              ? { ...s, channels: newChannels }
              : s
          );
        });
      } catch (err) {
        // If server doesn't exist (400/404), remove it from state
        const status = err?.response?.status;
        if (status === 400 || status === 404) {
          console.warn("Server may have been deleted, removing from list");
          setServers(prev => {
            const updated = prev.filter(s => s.id !== selectedServerId);
            if (updated.length > 0) {
              setSelectedServerId(updated[0].id);
              setSelectedChannel(updated[0].channels?.[0] || "general");
            } else {
              setSelectedServerId(null);
            }
            return updated;
          });
        }
      }
    };
    
    const interval = setInterval(pollChannels, 5000); // 5 seconds
    return () => clearInterval(interval);
  }, [selectedServerId]);

  // Poll for online users (for friends drawer)
  useEffect(() => {
    if (!currentUser) return; // Dont poll if not logged in
    
    const pollOnlineUsers = async () => {
      try {
        const res = await axios.get("/api/users/online", { withCredentials: true });
        const newOnline = res.data.online || [];
        
        // Detect new users who came online (not including self)
        if (prevOnlineUsersRef.current.length > 0) {
          const newlyOnline = newOnline.filter(
            u => !prevOnlineUsersRef.current.includes(u) && u !== currentUser
          );
          if (newlyOnline.length > 0) {
            playUserOnline();
          }
        }
        prevOnlineUsersRef.current = newOnline;
        
        setOnlineUsers(prev => {
          if (JSON.stringify(prev) === JSON.stringify(newOnline)) return prev;
          return newOnline;
        });
      } catch (err) {
        // Silently fail
      }
    };
    
    pollOnlineUsers(); // Initial fetch
    const interval = setInterval(pollOnlineUsers, 10000); // 10 seconds
    return () => clearInterval(interval);
  }, [currentUser]);

  // Poll for DM updates to notify user of new DMs while in chat
  useEffect(() => {
    if (!currentUser) return;
    
    const pollDms = async () => {
      try {
        const res = await axios.get("/api/dm/list", { withCredentials: true });
        let list = Array.isArray(res.data) ? res.data : (res.data?.dms || []);
        
        const newUnreadUsers = {};
        let anyUnread = false;
        
        for (const dm of list) {
          // Use the has_unread field from the backend
          if (dm.has_unread) {
            newUnreadUsers[dm.other_username] = true;
            anyUnread = true;
            
            // Check if this is a NEW unread message (for notification sound)
            const prevDm = prevDmListRef.current.find(p => p.dm_id === dm.dm_id);
            if (prevDm && !prevDm.has_unread && dm.has_unread) {
              // Newly unread - play sound
              playDoorbellDingDong();
            }
          }
        }
        
        setUnreadDmUsers(newUnreadUsers);
        setHasUnreadDms(anyUnread);
        prevDmListRef.current = list;
      } catch (err) {
        // Silently fail
      }
    };
    
    pollDms(); // Initial poll
    const interval = setInterval(pollDms, 5000);
    return () => clearInterval(interval);
  }, [currentUser]);
  // Poll for unread messages in servers and channels
  useEffect(() => {
    if (!currentUser || servers.length === 0) return;
    
    fetchUnreadStatus(); // Initial fetch
    const interval = setInterval(fetchUnreadStatus, 15000); // 15 seconds
    return () => clearInterval(interval);
  }, [currentUser, servers.length, selectedServerId, selectedChannel]);

  async function sendMessage() {
    if (!newBody.trim() || !selectedServerId) return;
    try {
      await axios.post(
        "/api/messages",
        { 
          server_id: selectedServerId,
          channel: selectedChannel, 
          body: newBody.trim() 
        },
        { withCredentials: true }
      );
      setNewBody("");
      playMessageSent();
      userSentMessageRef.current = true;
      
      await loadMessages(selectedChannel, selectedServerId);
      
      // Mark channel as read after sending (so own messages dont trigger unread)
      markChannelAsRead(selectedChannel, selectedServerId);
    } catch (err) {
      console.error("Send error:", err);
    } finally {
      // Keep focus on input for next message
      setTimeout(() => {
        if (messageInputRef.current) {
          messageInputRef.current.focus();
        }
      }, 50);
    }
  }

  // Friends drawer (triggered by DM button)
  async function loadFriends() {
    try {
      // Load all registered users from backend
      const usersRes = await axios.get("/api/users/list", { withCredentials: true });
      
      let allUsernames = [];
      if (usersRes.data && Array.isArray(usersRes.data.users)) {
        allUsernames = usersRes.data.users.map(user => user.username);
      }
      
      // Also load DM history to show who you've chatted with
      try {
        const dmRes = await axios.get("/api/dm/list", { withCredentials: true });
        let dmUsernames = [];
        if (Array.isArray(dmRes.data)) {
          dmUsernames = dmRes.data.map(dm => dm.other_username);
        } else if (dmRes.data && Array.isArray(dmRes.data.dms)) {
          dmUsernames = dmRes.data.dms.map(dm => dm.other_username);
        }
        
        // Combine all users + DM contacts (DMs at top)
        const dmSet = new Set(dmUsernames);
        const otherUsers = allUsernames.filter(u => !dmSet.has(u) && u !== currentUser);
        const uniqueFriends = [...dmUsernames, ...otherUsers];
        
        setFriends(uniqueFriends);
      } catch {
        // If DM list fails, just show all users
        setFriends(allUsernames.filter(u => u !== currentUser));
      }
    } catch (err) {
      console.error("Load friends error:", err);
      setFriends([]);
    }
  }

  function toggleFriendsDrawer() {
    if (!friendsDrawerOpen) {
      loadFriends();
    }
    setFriendsDrawerOpen(!friendsDrawerOpen);
  }

  // Close friends drawer when clicking outside
  useEffect(() => {
    if (!friendsDrawerOpen) return;
    
    const handleClickOutside = (event) => {
      // Check if click is outside the drawer and not on the DM button
      if (friendsDrawerRef.current && !friendsDrawerRef.current.contains(event.target)) {
        // Also check if it's not the DM button that opened it
        const dmButton = event.target.closest('.bcord-chat-rail-server');
        if (!dmButton) {
          setFriendsDrawerOpen(false);
        }
      }
    };
    
    // Add listener with slight delay to avoid immediate close
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [friendsDrawerOpen]);

  async function handleSelectFriend(username) {
    try {
      const res = await axios.post(
        "/api/dm/start",
        { other_username: username },
        { withCredentials: true }
      );
      
      // Clear unread status for this user
      setUnreadDmUsers(prev => ({...prev, [username]: false}));
      // Check if any other DMs are still unread
      const stillHasUnread = Object.entries(unreadDmUsers).some(([u, v]) => u !== username && v);
      setHasUnreadDms(stillHasUnread);
      navigate(`/dm/${res.data.dm_id}`);
      setFriendsDrawerOpen(false);
    } catch (err) {
      console.error("Start DM error:", err);
      alert("Failed to start DM with " + username);
    }
  }

  // Server management
  function handleSelectServer(serverId) {
    setSelectedServerId(serverId);
    const server = servers.find(s => s.id === serverId);
    // Switch to that server's first channel (always has #general)
    const firstChannel = server?.channels[0] || "general";
    setSelectedChannel(firstChannel);
    markChannelAsRead(firstChannel, serverId);
  }

  async function handleCreateServer() {
    if (!newServerName.trim()) return;
    
    const initials = newServerName.slice(0, 2).toUpperCase();
    
    try {
      const res = await axios.post(
        "/api/servers/create",
        { 
          name: newServerName, 
          initials: initials 
        },
        { withCredentials: true }
      );
      
      // Add new server to list
      const newServer = {
        id: res.data.server_id,
        name: res.data.name,
        initials: res.data.initials,
        channels: ["general"],
        role: "owner"
      };
      
      setServers([...servers, newServer]);
      setNewServerName("");
      setCreateServerModalOpen(false);
      // Switch to new server
      setSelectedServerId(newServer.id);
      setSelectedChannel("general");
      
    } catch (err) {
      console.error("Create server error:", err);
      alert("Failed to create server: " + (err.response?.data?.error || err.message));
    }
  }

  async function handleDeleteServer() {
    if (!deleteServerConfirm) return;
    
    try {
      await axios.delete(`/api/servers/${deleteServerConfirm}`, {
        withCredentials: true
      });
      
      // Remove server from list
      const updatedServers = servers.filter(s => s.id !== deleteServerConfirm);
      setServers(updatedServers);
      
      // Switch to first remaining server
      if (updatedServers.length > 0) {
        setSelectedServerId(updatedServers[0].id);
        setSelectedChannel(updatedServers[0].channels[0] || "general");
      } else {
        setSelectedServerId(null);
        setSelectedChannel("general");
      }
      
      setDeleteServerConfirm(null);
      
    } catch (err) {
      console.error("Delete server error:", err);
      alert("Failed to delete server: " + (err.response?.data?.error || err.message));
      setDeleteServerConfirm(null);
    }
  }


  async function handleLeaveServer() {
    if (!leaveServerConfirm) return;
    
    try {
      await axios.post(`/api/servers/${leaveServerConfirm}/leave`, {}, {
        withCredentials: true
      });
      
      // Remove server from list
      const updatedServers = servers.filter(s => s.id !== leaveServerConfirm);
      setServers(updatedServers);
      
      // Switch to first remaining server
      if (updatedServers.length > 0) {
        setSelectedServerId(updatedServers[0].id);
        setSelectedChannel(updatedServers[0].channels[0] || "general");
      } else {
        setSelectedServerId(null);
        setSelectedChannel("general");
      }
      
      setLeaveServerConfirm(null);
      
    } catch (err) {
      console.error("Leave server error:", err);
      alert("Failed to leave server: " + (err.response?.data?.error || err.message));
      setLeaveServerConfirm(null);
    }
  }
  // Channel management
  async function handleCreateChannel() {
    if (!newChannelName.trim() || !selectedServerId) return;
    
    // Sanitize channel name (lowercase, no spaces, alphanumeric + hyphens)
    const channelName = newChannelName.trim().toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    if (!channelName) {
      alert("Invalid channel name");
      return;
    }
    
    try {
      await axios.post(
        `/api/servers/${selectedServerId}/channels`,
        { name: channelName },
        { withCredentials: true }
      );
      
      // Reload channels for this server
      const channelsRes = await axios.get(`/api/servers/${selectedServerId}/channels`, {
        withCredentials: true,
      });
      
      // Update server's channels in state
      setServers(servers.map(s => 
        s.id === selectedServerId 
          ? { ...s, channels: channelsRes.data.channels.map(ch => { channelIdCache.current[`${server.id}-${ch.name}`] = ch.id; return ch.name; }) }
          : s
      ));
      
      setNewChannelName("");
      setCreateChannelModalOpen(false);
      setSelectedChannel(channelName);
      
    } catch (err) {
      console.error("Create channel error:", err);
      alert("Failed to create channel: " + (err.response?.data?.error || err.message));
    }
  }

  async function handleDeleteChannel() {
    if (!deleteChannelConfirm || !selectedServerId) return;
    
    const channelToDelete = deleteChannelConfirm;
    
    try {
      await axios.delete(
        `/api/servers/${selectedServerId}/channels/${channelToDelete}`,
        { withCredentials: true }
      );
      
      // Reload channels for this server
      const channelsRes = await axios.get(`/api/servers/${selectedServerId}/channels`, {
        withCredentials: true,
      });
      
      // Update server's channels in state
      setServers(servers.map(s => 
        s.id === selectedServerId 
          ? { ...s, channels: channelsRes.data.channels.map(ch => { channelIdCache.current[`${server.id}-${ch.name}`] = ch.id; return ch.name; }) }
          : s
      ));
      
      // If we deleted the current channel, switch to general
      if (selectedChannel === channelToDelete) {
        setSelectedChannel("general");
      }
      
      setDeleteChannelConfirm(null);
      
    } catch (err) {
      console.error("Delete channel error:", err);
      alert("Failed to delete channel: " + (err.response?.data?.error || err.message));
      setDeleteChannelConfirm(null);
    }
  }

  // Profile menu
  function toggleProfileMenu() {
    setProfileMenuOpen(!profileMenuOpen);
  }

  async function handleLogout() {
    try {
      await axios.post("/api/auth/logout", {}, { withCredentials: true });
      // Clear the authenticated user reference
      authenticatedUserRef.current = null;
      navigate("/login");
    } catch (err) {
      console.error("Logout error:", err);
      navigate("/login");
    }
  }

  const userInitials = currentUser ? currentUser.slice(0, 2).toUpperCase() : "??";
  const isServerOwner = currentServer?.role === "owner";

  return (
    <div className="bcord-chat-root">
      {/* Session Warning Modal */}
      {sessionWarning && (
        <div className="session-warning-overlay">
          <div className="session-warning-modal">
            <div className="warning-icon">⚠️</div>
            <h2>Session Changed</h2>
            <p>
              Another account has logged in on this browser. 
              You are being redirected to the login page for security.
            </p>
            <p className="warning-note">
              Note: Only one account can be active per browser. 
              Use a different browser or incognito window for multiple accounts.
            </p>
          </div>
        </div>
      )}

      <div className="bcord-chat-topbar">
        <div className="bcord-chat-topbar-left">
          <div className="bcord-chat-topbar-title">{currentServer?.name || "BeKord"}</div>
          <div className="bcord-chat-topbar-subtitle">
            #{selectedChannel}
          </div>
        </div>
        <div className="bcord-chat-topbar-right">
          {/* Invitations Bell */}
          <div className="bcord-invitations-container">
            <button
              className="bcord-invitations-bell-btn"
              onClick={() => setInvitationsOpen(!invitationsOpen)}
              title="Invitations"
            >
              🔔
              {invitations.length > 0 && (
                <span className="bcord-invitations-badge">{invitations.length}</span>
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
                  <h3 style={{ margin: 0 }}>Server Invitations</h3>
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
                {invitations.length === 0 ? (
                  <p className="bcord-no-invitations">No pending invitations</p>
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
                            onClick={() => handleAcceptInvitation(inv.server_id)}
                          >
                            ✓ Accept
                          </button>
                          <button
                            className="bcord-invitation-decline"
                            onClick={() => handleDeclineInvitation(inv.server_id)}
                          >
                            ✗ Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div 
        className="bcord-chat-body"
        style={{
          gridTemplateColumns: rumbleCollapsed 
            ? `${leftSectionWidth}px minmax(0, 1fr) 0px`
            : `${leftSectionWidth}px minmax(0, 1fr) 260px`
        }}
      >
        {/* LEFT SECTION - RAIL + CHANNELS + USER PANEL */}
        <div className="bcord-left-section" style={{ width: `${leftSectionWidth}px` }}>
          <div 
            className="resize-handle resize-handle-right"
            onMouseDown={handleResizeStart}
          />
          <div className="bcord-left-content">
            {/* LEFT RAIL - APP LOGO + SERVERS */}
            <div className="bcord-chat-col bcord-chat-rail">
              <div className="bcord-chat-rail-top">
            {/* DM = App Logo + Friends Button (DON'T TOUCH) */}
            <div 
              className="bcord-chat-rail-server"
              onClick={() => navigate('/dm')}
              style={{ cursor: 'pointer' }}
              title="Direct Messages"
            >
              <div className="initials">DM</div>
              {hasUnreadDms && <div className="dm-notification-dot"></div>}
            </div>
            
            <div className="bcord-chat-rail-top-divider" />
            
            {/* SERVER LIST */}
            {servers.map((server) => (
              <button
                key={server.id}
                className={`bcord-chat-rail-room ${selectedServerId === server.id ? "active" : ""}`}
                onClick={() => handleSelectServer(server.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (server.role === "owner") {
                    setDeleteServerConfirm(server.id);
                  } else {
                    setLeaveServerConfirm(server.id);
                  }
                }}
                title={`${server.name} (Right-click to ${server.role === 'owner' ? 'delete' : 'leave'})`}
              >
                <div className="initials">{server.initials}</div>
                {unreadServers[server.id] && <div className="server-unread-dot" />}
              </button>
            ))}
            
            {/* CREATE SERVER BUTTON (+) */}
            <button
              className="bcord-chat-rail-room add-server"
              onClick={() => setCreateServerModalOpen(true)}
              title="Create New Server"
            >
              <div className="initials">+</div>
            </button>
          </div>
        </div>

        {/* CHANNELS SIDEBAR (shows current server's channels) */}
        <div className="bcord-chat-col bcord-chat-rooms">
          <div className="bcord-chat-rooms-header">
            <div className="bcord-chat-rooms-title">CHANNELS</div>
            {isServerOwner && (
              <button 
                className="bcord-chat-rooms-add-btn"
                onClick={() => setCreateChannelModalOpen(true)}
                title="Create Channel"
              >
                +
              </button>
            )}
            {isServerOwner && (
              <button
                className="bcord-chat-invite-btn"
                onClick={() => {
                  console.log('[Invite Button] Clicked! Opening modal...');
                  loadFriends(); // Load friends list for selection
                  loadServerMembers(selectedServerId); // Load current members to filter
                  setSelectedFriendsToInvite([]); // Reset selection
                  setInviteUserModalOpen(true);
                }}
                title="Invite Users"
              >
                👥
              </button>
            )}
          </div>
          <div className="bcord-chat-rooms-list">
            {currentChannels.map((channel) => (
              <button
                key={channel}
                className={`bcord-chat-room-item ${selectedChannel === channel ? "active" : ""}`}
                onClick={() => { setSelectedChannel(channel); markChannelAsRead(channel, selectedServerId); }}
              >
                <div className="bcord-chat-room-content">
                  {unreadChannels[`${selectedServerId}-${channel}`] && <span className="channel-unread-dot" />}
                  <span className="hash">#</span>
                  <span className="label">{channel}</span>
                </div>
                {isServerOwner && channel !== "general" && (
                  <button
                    className="bcord-chat-room-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteChannelConfirm(channel);
                    }}
                    title="Delete Channel"
                  >
                    ×
                  </button>
                )}
              </button>
            ))}
          </div>
        </div>
        </div>

        {/* USER PROFILE PANEL - Spans both rail and channels */}
        <div className="bcord-user-panel">
            <div className="bcord-user-panel-info">
              <div 
                className="bcord-user-panel-avatar"
                onClick={toggleProfileMenu}
                title={`${currentUser} - Click for menu`}
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
              <button 
                className="bcord-user-panel-btn"
                onClick={() => alert('Voice features coming soon!')}
                title="Microphone (Coming Soon)"
              >
                🎤
              </button>
              <button 
                className="bcord-user-panel-btn"
                onClick={() => alert('Voice features coming soon!')}
                title="Headphones (Coming Soon)"
              >
                🎧
              </button>
              <button 
                className="bcord-user-panel-btn"
                onClick={() => alert('Settings coming soon!')}
                title="User Settings (Coming Soon)"
              >
                ⚙️
              </button>
            </div>
          </div>
        </div>

        {/* MAIN CHAT AREA */}
        <div className="bcord-chat-col bcord-chat-main">
          <div className="bcord-chat-main-header">
            <div className="bcord-chat-main-room">
                  <span className="hash">#</span>
              <span>{selectedChannel}</span>
            </div>
          </div>

          <div className="bcord-chat-messages" ref={messagesContainerRef} onScroll={handleMessagesScroll}>
            {messages.length === 0 && (
              <div className="bcord-chat-empty">No messages yet.</div>
            )}
            {messages.map((msg, index) => (
              <React.Fragment key={msg.id}>
                {shouldShowDateSeparator(msg, messages[index - 1]) && (
                  <div className="bcord-chat-date-separator">
                    <span className="bcord-chat-date-line"></span>
                    <span className="bcord-chat-date-text">{formatDate(msg.created_at)}</span>
                    <span className="bcord-chat-date-line"></span>
                  </div>
                )}
                <div className="bcord-chat-message">
                  <div className="bcord-chat-message-avatar">
                    {msg.sender.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="bcord-chat-message-body">
                    <div className="bcord-chat-message-meta">
                      <span className="sender">{msg.sender}</span>
                      <span className="time">{formatTime(msg.created_at)}</span>
                    </div>
                    <div className="bcord-chat-message-text">{msg.body}</div>
                  </div>
                </div>
              </React.Fragment>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="bcord-chat-composer">
            <textarea
              ref={messageInputRef}
              className="bcord-chat-input"
              value={newBody}
              onChange={(e) => {
                const value = e.target.value;
                if (value.length <= 500) {
                  setNewBody(value);
                  // Auto-resize
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                  // Reset height after sending
                  e.target.style.height = 'auto';
                }
              }}
              placeholder={`Message #${selectedChannel}`}
              rows={1}
              maxLength={500}
            />
            {newBody.length > 400 && (
              <span style={{
                position: 'absolute',
                right: '80px',
                bottom: '18px',
                fontSize: '11px',
                color: newBody.length >= 500 ? '#ef4444' : '#9ca3af'
              }}>
                {newBody.length}/500
              </span>
            )}
            <button className="bcord-chat-send-btn" onClick={sendMessage}>
              Send
            </button>
          </div>
        </div>

        {/* RUMBLE COLLAPSE BUTTON - Always visible */}
        <div 
          className={`rumble-collapse-btn ${rumbleCollapsed ? 'collapsed' : ''}`}
          onClick={() => setRumbleCollapsed(!rumbleCollapsed)}
          title={rumbleCollapsed ? "Show Rumble Lineup" : "Hide Rumble Lineup"}
        />

        {/* RIGHT SIDEBAR */}
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

      {/* Create Server Modal */}
      {createServerModalOpen && (
        <div className="profile-menu-overlay" onClick={() => setCreateServerModalOpen(false)}>
          <div className="create-server-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create a Server</h2>
              <button className="close-btn" onClick={() => setCreateServerModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '12px' }}>
                Your server will start with a #general channel. You can add more channels later.
              </p>
              <label style={{ display: 'block', marginBottom: '8px', color: '#e5e7eb', fontWeight: '600' }}>
                Server Name
              </label>
              <input
                type="text"
                value={newServerName}
                onChange={(e) => setNewServerName(e.target.value)}
                placeholder="My Awesome Server"
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#e5e7eb',
                  fontSize: '16px'
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateServer();
                  }
                }}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button 
                className="btn-cancel"
                onClick={() => setCreateServerModalOpen(false)}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button 
                className="btn-create"
                onClick={handleCreateServer}
                style={{
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                Create Server
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Channel Modal */}
      {createChannelModalOpen && (
        <div className="profile-menu-overlay" onClick={() => setCreateChannelModalOpen(false)}>
          <div className="create-server-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create a Channel</h2>
              <button className="close-btn" onClick={() => setCreateChannelModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '12px' }}>
                Channel names must be lowercase with no spaces (use hyphens instead).
              </p>
              <label style={{ display: 'block', marginBottom: '8px', color: '#e5e7eb', fontWeight: '600' }}>
                Channel Name
              </label>
              <input
                type="text"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="new-channel"
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#e5e7eb',
                  fontSize: '16px'
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateChannel();
                  }
                }}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button 
                className="btn-cancel"
                onClick={() => setCreateChannelModalOpen(false)}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button 
                className="btn-create"
                onClick={handleCreateChannel}
                style={{
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                Create Channel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Channel Confirmation */}
      {deleteChannelConfirm && (
        <div className="profile-menu-overlay" onClick={() => setDeleteChannelConfirm(null)}>
          <div className="session-warning-modal" onClick={(e) => e.stopPropagation()}>
            <div className="warning-icon">⚠️</div>
            <h2>Delete Channel?</h2>
            <p>
              Are you sure you want to delete #{deleteChannelConfirm}?
            </p>
            <p className="warning-note">
              This will permanently delete all messages in this channel. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button 
                onClick={() => setDeleteChannelConfirm(null)}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'transparent',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteChannel}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#dc2626',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                Delete Channel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Server Confirmation */}
      {deleteServerConfirm && (
        <div className="profile-menu-overlay" onClick={() => setDeleteServerConfirm(null)}>
          <div className="session-warning-modal" onClick={(e) => e.stopPropagation()}>
            <div className="warning-icon">⚠️</div>
            <h2>Delete Server?</h2>
            <p>
              Are you sure you want to delete {servers.find(s => s.id === deleteServerConfirm)?.name}?
            </p>
            <p className="warning-note">
              This will permanently delete the server, all its channels, and all messages. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button 
                onClick={() => setDeleteServerConfirm(null)}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'transparent',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteServer}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#dc2626',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                Delete Server
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Server Confirmation Modal */}
      {leaveServerConfirm && (
        <div className="profile-menu-overlay" onClick={() => setLeaveServerConfirm(null)}>
          <div className="session-warning-modal" onClick={(e) => e.stopPropagation()}>
            <div className="warning-icon">🚪</div>
            <h2>Leave Server?</h2>
            <p>
              Are you sure you want to leave {servers.find(s => s.id === leaveServerConfirm)?.name}?
            </p>
            <p className="warning-note">
              You will need to be invited again to rejoin this server.
            </p>
            <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
              <button 
                onClick={() => setLeaveServerConfirm(null)}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "transparent",
                  border: "1px solid #475569",
                  borderRadius: "8px",
                  color: "#e5e7eb",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                Cancel
              </button>
              <button 
                onClick={handleLeaveServer}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "#f59e0b",
                  border: "none",
                  borderRadius: "8px",
                  color: "#000",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "600"
                }}
              >
                Leave Server
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite User Modal */}
      {(() => {
        console.log('[Invite Modal] inviteUserModalOpen =', inviteUserModalOpen);
        return inviteUserModalOpen;
      })() && (
        <div className="profile-menu-overlay" onClick={() => setInviteUserModalOpen(false)}>
          <div className="create-server-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h2>Invite Users to Server</h2>
              <button className="close-btn" onClick={() => setInviteUserModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {/* Friends List Section - filter out existing members */}
              {(() => {
                const invitableFriends = friends.filter(f => !currentServerMembers.includes(f));
                return invitableFriends.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#e5e7eb', fontWeight: '600' }}>
                    Select Friends ({selectedFriendsToInvite.length} selected)
                  </label>
                  <div style={{
                    maxHeight: '200px',
                    overflowY: 'auto',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '8px'
                  }}>
                    {invitableFriends.map((username) => (
                      <label
                        key={username}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '10px 12px',
                          cursor: 'pointer',
                          borderRadius: '6px',
                          transition: 'background 0.2s',
                          background: selectedFriendsToInvite.includes(username) ? '#1e3a5f' : 'transparent'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = selectedFriendsToInvite.includes(username) ? '#1e3a5f' : '#1e293b'}
                        onMouseLeave={(e) => e.currentTarget.style.background = selectedFriendsToInvite.includes(username) ? '#1e3a5f' : 'transparent'}
                      >
                        <input
                          type="checkbox"
                          checked={selectedFriendsToInvite.includes(username)}
                          onChange={() => toggleFriendForInvite(username)}
                          style={{
                            width: '18px',
                            height: '18px',
                            marginRight: '12px',
                            accentColor: '#6366f1',
                            cursor: 'pointer'
                          }}
                        />
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: '10px',
                          fontSize: '14px',
                          fontWeight: '600',
                          color: '#fff'
                        }}>
                          {username.substring(0, 2).toUpperCase()}
                        </div>
                        <span style={{ color: '#e5e7eb', fontSize: '14px' }}>{username}</span>
                        {onlineUsers.includes(username) && (
                          <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: '#22c55e',
                            marginLeft: '8px'
                          }}></span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              );
              })()}
              
              {/* Divider */}
              {friends.filter(f => !currentServerMembers.includes(f)).length > 0 && (
                <div style={{ 
                  borderTop: '1px solid #334155', 
                  margin: '16px 0', 
                  position: 'relative',
                  textAlign: 'center'
                }}>
                  <span style={{
                    position: 'absolute',
                    top: '-10px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#1e293b',
                    padding: '0 12px',
                    color: '#64748b',
                    fontSize: '12px'
                  }}>OR</span>
                </div>
              )}
              
              {/* Manual Username Input */}
              <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '12px' }}>
                {friends.filter(f => !currentServerMembers.includes(f)).length > 0 ? 'Invite someone who isn\'t on your friends list:' : 'Enter the username of the person you want to invite:'}
              </p>
              <label style={{ display: 'block', marginBottom: '8px', color: '#e5e7eb', fontWeight: '600' }}>
                Username
              </label>
              <input
                type="text"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                placeholder="Enter username..."
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#e5e7eb',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleInviteUser();
                  }
                }}
              />
            </div>
            <div className="modal-footer">
              <button 
                className="btn-cancel"
                onClick={() => {
                  setInviteUserModalOpen(false);
                  setSelectedFriendsToInvite([]);
                  setInviteUsername("");
                }}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button 
                className="btn-create"
                onClick={handleInviteUser}
                style={{
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                Send Invite{selectedFriendsToInvite.length > 0 ? `s (${selectedFriendsToInvite.length + (inviteUsername.trim() ? 1 : 0)})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Panel */}
      {adminPanelOpen && (
        <AdminPanel onClose={() => setAdminPanelOpen(false)} />
      )}

      {/* Profile Menu */}
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
    </div>
  );
}

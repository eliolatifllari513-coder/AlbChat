const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const activeUsers = new Map(); // socket.id -> { username, room }
const mutedUsers = new Map();  // username -> expireTimestamp

// Lista e fjalëve të ndaluara (Profanity Filter)
const badWords = [
  'rrot kari', 'pidh', 'kurbat', 'jevg', 'shka', 'robt', 'motren', 'gabel',
  'bitch', 'fuck', 'nigger', 'nigga', 'whore', 'cunt', 'retard'
];

io.on('connection', (socket) => {

  // 1. Logjika e Hyrjes
  socket.on('join', ({ username, room }) => {
    const isTaken = Array.from(activeUsers.values()).some(
      u => u.username.toLowerCase() === username.toLowerCase()
    );

    if (isTaken) {
      return socket.emit('error_msg', 'Ky Username është i zënë për momentin! Zgjidh një tjetër.');
    }

    const isAdmin = (username === 'adminelio1994');
    activeUsers.set(socket.id, { username, room, isAdmin });
    
    socket.join(room);
    socket.emit('joinSuccess', { username, isAdmin });

    io.to(room).emit('message', { 
      user: 'Sistemi', 
      text: `${username} u lidh në dhomën ${room}.` 
    });

    // Përditësojmë listën e përdoruesve për Adminin
    updateAdminPanel();
  });

  // 2. Ndërrimi i Dhomave
  socket.on('switchRoom', (newRoom) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    socket.leave(user.room);
    user.room = newRoom;
    socket.join(newRoom);
    socket.emit('message', { user: 'Sistemi', text: `Kalove në dhomën: ${newRoom}` });
  });

  // 3. Dërgimi i Mesazheve
  socket.on('chatMessage', (msg) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    // Kontrolli i Mute (10 Minuta)
    if (mutedUsers.has(user.username)) {
      const unmuteTime = mutedUsers.get(user.username);
      if (Date.now() < unmuteTime) {
        const remainingMin = Math.ceil((unmuteTime - Date.now()) / 60000);
        return socket.emit('message', { 
          user: 'Sistemi', 
          text: `Jeni i bllokuar (Mute). Ju mbeten edhe ${remainingMin} minuta.` 
        });
      } else {
        mutedUsers.delete(user.username);
      }
    }

    // Kontrolli i Fjalëve të Ndaluara / Racizmit
    const isBad = badWords.some(word => msg.toLowerCase().includes(word));
    if (isBad) {
      return socket.emit('message', { 
        user: 'Sistemi', 
        text: 'Mesazhi u bllokua përmban fjalë të ndaluara ose raciste!' 
      });
    }

    // Transmetimi i mesazhit (Anonimitet i plotë - nuk ruhet në bazë të dhënash)
    io.to(user.room).emit('message', { user: user.username, text: msg });
  });

  // 4. Komandat e Adminit (KICK & MUTE)
  socket.on('adminAction', ({ action, targetUser }) => {
    const current = activeUsers.get(socket.id);
    if (!current || current.username !== 'adminelio1994') return;

    let targetSocketId = null;
    for (let [id, u] of activeUsers.entries()) {
      if (u.username === targetUser) {
        targetSocketId = id;
        break;
      }
    }

    if (action === 'kick' && targetSocketId) {
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit('kicked');
        targetSocket.disconnect(true);
      }
    } else if (action === 'mute') {
      mutedUsers.set(targetUser, Date.now() + 10 * 60 * 1000); // 10 Minuta
      io.emit('message', { 
        user: 'Sistemi', 
        text: `Përdoruesi ${targetUser} u bë Mute për 10 minuta nga Admini.` 
      });
    }
  });

  // 5. Dalja / Refresh (Fshirja e automatizuar)
  socket.on('disconnect', () => {
    activeUsers.delete(socket.id);
    updateAdminPanel();
  });

  function updateAdminPanel() {
    const usersList = Array.from(activeUsers.values()).map(u => u.username);
    // Dërgojmë listën e përdoruesve aktivë te admini
    for (let [id, u] of activeUsers.entries()) {
      if (u.username === 'adminelio1994') {
        io.to(id).emit('adminUserList', usersList);
      }
    }
  }
});

http.listen(3000, () => console.log('AlbChat po punon 24/7 në portin 3000'));


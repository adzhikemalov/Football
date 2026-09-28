// Optional relay (TURN) servers for online play.
//
// You don't need to set anything here. When two browsers can't link
// directly, the game already falls back to a free public relay (see net.js).
// A TURN server gives lower delay on strict networks, so add one here if
// you have one.
//
// Option 1, Metered.ca (free plan, has TCP/TLS on port 443):
//   1. Sign up at https://www.metered.ca/tools/openrelay/ and create an app.
//   2. In the dashboard under TURN Server, copy the credentials URL. It looks
//      like https://<your-app>.metered.live/api/v1/turn/credentials?apiKey=...
//   3. Paste it as credentialsUrl below.
//   The key is visible to anyone who opens the page. Metered's free plan is
//   meant to be used like this, but watch the monthly bandwidth limit.
//
// Option 2, any TURN server with fixed credentials:
//   iceServers: [
//     { urls: ['turn:turn.example.com:3478', 'turns:turn.example.com:443?transport=tcp'],
//       username: 'user', credential: 'secret' },
//   ],
window.FOOTBALL_ICE = {
  credentialsUrl: '',
  iceServers: [],
};

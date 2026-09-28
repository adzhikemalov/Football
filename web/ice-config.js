// Relay (TURN) servers for online play.
//
// Most home connections work directly and need nothing here. Strict
// networks (many mobile carriers, offices, schools) need a TURN relay, and
// PeerJS's free relays no longer exist, so set one up here. Choose one option.
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

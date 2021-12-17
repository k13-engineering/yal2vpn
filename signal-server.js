import WebSocket, { WebSocketServer } from "ws";


const wss = new WebSocketServer({
    port: 7777
});

wss.on('connection', function connection(ws) {
  ws.on('message', function message(data, isBinary) {
      console.log("message =", data);
    wss.clients.forEach(function each(client) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        console.log("sending");
        client.send(data, { binary: isBinary });
      }
    });
  });
});
import express from "express";
import expressWs from "express-ws";

const app = express();
expressWs(app);

let connections = [];

app.ws("/644c4f6c-fa52-4285-9317-69c14b599d79", (ws, req) => {
  const remote = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
  console.log(`${remote} connected`);
  
  connections = [
    ...connections,
    ws
  ];

  ws.on("message", (data) => {
    connections.forEach((conn) => {
      conn.send(data);
    });
  });

  ws.on("close", () => {
    connections = connections.filter((conn) => {
      return conn !== ws;
    });
  });
});

const port = 8080;

app.listen(port);

console.log(`listening on :${port}`);
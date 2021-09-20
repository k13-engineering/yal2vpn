import WebSocket from "ws";
import ReconnectingWebSocket from "reconnecting-websocket";
import naiveEmitter from "naive-emitter";

const expectedPingInterval = 10000;
const pingTimeout = 3 * expectedPingInterval;

const create = ({ logger, url }) => {
  const connectedEmitter = naiveEmitter.create();
  const discconnectedEmitter = naiveEmitter.create();
  const messageEmitter = naiveEmitter.create();

  let closeRequested = false;

  let open = false;
  let lastEmittedOpen = false;

  const maybeInformAboutConnection = () => {
    if (closeRequested) {
      return;
    }

    if (open === lastEmittedOpen) {
      return;
    }

    if (open) {
      connectedEmitter.emit();
    } else {
      discconnectedEmitter.emit();
    }

    lastEmittedOpen = open;
  };

  const rws = new ReconnectingWebSocket(url, [], {
    WebSocket,
    maxReconnectionDelay: 60000,
  });

  let pingTimeoutHandle = undefined;
  const refreshPingTimeout = () => {
    if (pingTimeoutHandle) {
      clearTimeout(pingTimeoutHandle);
    }

    pingTimeoutHandle = setTimeout(() => {
      pingTimeoutHandle = undefined;

      logger.log("ping timeout, reconnecting...");
      rws.reconnect();
    }, pingTimeout);
  };

  rws.addEventListener("open", (event) => {
    const ws = event.target;
    ws.on("ping", () => {
      refreshPingTimeout();
    });
    refreshPingTimeout();

    logger.log("WebSocket connected");

    open = true;
    maybeInformAboutConnection();
  });

  rws.addEventListener("message", ({ data }) => {
    const msgAsBase64String = data.toString("utf8");
    const msgAsBuffer = Buffer.from(msgAsBase64String, "base64");

    messageEmitter.emit({ message: msgAsBuffer });
  });

  rws.addEventListener("close", () => {
    if (!closeRequested) {
      logger.warn("WebSocket closed");
    }

    clearTimeout(pingTimeoutHandle);
    pingTimeoutHandle = undefined;

    open = false;
    maybeInformAboutConnection();
  });

  rws.addEventListener("error", ({ message }) => {
    if (
      message === "WebSocket was closed before the connection was established"
    ) {
      return;
    }

    logger.error("WebSocket error", message);
  });

  const send = ({ packet }) => {
    const packetAsBase64 = packet.toString("base64");
    rws.send(packetAsBase64);
  };

  const close = () => {
    closeRequested = true;
    rws.close();
  };

  return {
    onConnected: connectedEmitter.on,
    onDisconnected: discconnectedEmitter.on,
    onMessage: messageEmitter.on,

    send,

    close,
  };
};

export default {
  create,
};

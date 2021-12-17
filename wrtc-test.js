// import wrtc from "wrtc";
// import jitsi from "lib-jitsi-meet";

// import jsdom from "jsdom";
// import fs from "fs";
// import vm from "vm";

// const scriptCode = fs.readFileSync("./node_modules/lib-jitsi-meet/dist/lib-jitsi-meet.js", "utf8");

// const navigator = {
//     userAgent: "NodeJS",
//     platform: "NodeJS",
//     mimeTypes: {
//         length: 0
//     },
//     abc: "hello"
// };

// const createElement = () => {
//     return {};
// };

// const getElementsByTagName = () => {
//     return [];
// };

// const document = {
//     createElement,
//     getElementsByTagName
// };

// const context = {
//     navigator,
//     document,
//     webrtcDetectedDCSupport: false,

//     console: global.console
// };

// context.window = context;

// vm.createContext(context);

// vm.runInContext(`
// const proxify = (obj, parents = []) => {
//     if (typeof obj === "object") {
//         Object.keys(obj).forEach((key) => {
//             console.log("key =", key);
//             if (parents.indexOf(obj[key]) < 0) {
//                 proxify(obj[key], [ ...parents, obj ]);
//             }
//         });

//         new Proxy(obj, {
//             get: function(target, prop, receiver) {
//                 conosole.log("target =", target, "prop =", prop, "receiver =", receiver);
//                 return Reflect.get(...arguments);
//             }
//         });
//     }
// };

// proxify(window);

// ${scriptCode}

// JitsiMeetJS.init({
//     disableThirdPartyRequests: true
// });

// const conn = new JitsiMeetJS.JitsiConnection(null, null, {

// });

// `, context);

// const dom = new jsdom.JSDOM(`
// <html>
//     <head>
//         <script>
//             ${scriptCode}
//         </script>
//     </head>
// </html>
// `, { runScripts: "dangerously" });

import WebSocket from "ws";
import NodeRSA from "node-rsa";
import fs from "fs";
import wrtc from "wrtc";
import { v4 } from "uuid";

import { performance } from "perf_hooks";

// const xmpp = client({
//     service: "wss://meet.jit.si/xmpp-websocket?room=reliableyearsdiminishlightly",
//     domain: "meet.jit.si:443"
// });
// xmpp.on("connect", () => {
//     console.log("connect!");
// });
// xmpp.on("error", (err) => {
//     console.error(err);
// });

// xmpp.start().catch((err) => {
//     console.error(err);
// });

const encrypt = ({ key, data }) => {
  const rsa = new NodeRSA();
  rsa.importKey(key);
  if (rsa.isPrivate()) {
    return rsa.encryptPrivate(data);
  } else {
    return rsa.encrypt(data);
  }
};

const decrypt = ({ key, data }) => {
  const rsa = new NodeRSA();
  rsa.importKey(key);
  if (rsa.isPrivate()) {
    return rsa.decrypt(data);
  } else {
    return rsa.decryptPublic(data);
  }
};

const keyNameToUse = process.argv[2];
if (!keyNameToUse) {
  throw Error("key name needs to be provided");
}

const publicKeys = {
  bob: fs.readFileSync("./keys/bob/key.pub", "utf8"),
  alice: fs.readFileSync("./keys/alice/key.pub", "utf8"),
};

const privateKey = fs.readFileSync(`./keys/${keyNameToUse}/key`, "utf8");
const publicKey = fs.readFileSync(`./keys/${keyNameToUse}/key.pub`, "utf8");

const clientUuid = v4();

const wsc = new WebSocket("ws://localhost:7777");

const sendPacket = ({ key, packet }) => {
  const dataAsString = JSON.stringify(packet);
  const dataAsBuffer = Buffer.from(dataAsString, "utf8");

  const encrypted = encrypt({ key, data: dataAsBuffer });
  const encryptedAsBase64 = encrypted.toString("base64");

  wsc.send(encryptedAsBase64);
};

wsc.on("open", () => {
  console.log("open!");

  const packet = {
    type: "hello",
    from: clientUuid,
  };

  sendPacket({ key: privateKey, packet });
});

let peerSessions = {};

const connect = ({ peer }) => {
  console.log("connecting to", { peer });

  

  const pc = new wrtc.RTCPeerConnection({
    // iceServers: [
    //     {
    //         urls: 'stun:stun.l.google.com:19302'
    //     }
    // ]
  });

  const channel = pc.createDataChannel("vpn");
  channel.onopen = () => {
    console.log("channel open!");
  };
  channel.onclose = () => {
    console.log("channel close!");
  };

  pc.addEventListener("icecandidate", (event) => {
    // console.log("event =", event);
    if (event.candidate === null) {
      console.log("all candidates");
      let sdp = pc.localDescription.sdp;
      console.log("localDescription =", pc.localDescription);

      const packet = {
        type: "offer",
        from: clientUuid,
        to: peer.clientId,
        sdp
      };

      sendPacket({ key: privateKey, packet });
    }
  });

  pc.createOffer()
    .then((d) => {
      pc.setLocalDescription(d);
    })
    .catch((ex) => {
      console.error(ex);
    });
  
  const processAnswer = ({ sdp }) => {
    pc.setRemoteDescription({ type: "answer", sdp });
  };
  
  const session = {
    processAnswer
  };

  peerSessions = {
    ...peerSessions,
    [peer.clientId]: session
  };
};

const processHello = ({ packet, publicKey }) => {
  const peer = {
    clientUuid: packet.clientUuid,
    publicKey,
  };

  knownPeers[peer.clientUuid] = peer;

  if (!activeConnections[peer.clientUuid]) {
    connect({ peer });
  }
};

const processOffer = ({ packet }) => {
  if (packet.for !== clientUuid) {
    return;
  }

  
};

const maybeDecrypt = ({ key, data }) => {
  try {
    return decrypt({ key, data });
  } catch (ex) {
    return undefined;
  }
};

const tryDecryptPacket = ({ packet }) => {
  let data = undefined;
  let key = privateKey;

  data = maybeDecrypt({ key: privateKey, data: packet });
  if (!data) {
    Object.keys(publicKeys).some((name) => {
      key = publicKeys[name];
      data = maybeDecrypt({ key, data: packet });
      return data;
    });
  }

  if (data) {
    return {
      key,
      data
    };
  } else {
    return undefined;
  }
};

const findKeyName = ({ key }) => {
  return Object.keys(publicKeys).find((name) => {
    return publicKeys[name] === key;
  }) || "???";
};

const logPacket = ({ key, packet }) => {
  const keyName = findKeyName({ key });

  const clientId = packet.from || "???";

  console.log(`[${keyName}@${clientId}] ${JSON.stringify(packet)}`);
};

let discoveredPeers = {};

const maybeConnect = () => {
  Object.keys(discoveredPeers).forEach((clientId) => {
    if (!peerSessions[clientId]) {
      connect({ peer: discoveredPeers[clientId] });
    }
  });
};

const handlers = {
  hello ({ key, packet }) {
    console.log("hello from", packet.from);

    discoveredPeers = {
      ...discoveredPeers,
      [packet.from]: {
        publicKey: key,
        clientId: packet.from
      }
    };

    maybeConnect();
  },

  offer ({ key, packet }) {
    console.log("got offer");

    const pc = new wrtc.RTCPeerConnection({});

    pc.addEventListener("icecandidate", (event) => {
      if (event.candidate === null) {
        console.log("remote ice candidate");

        const sdp = pc.localDescription.sdp;

        const packetReturn = {
          type: "answer",
          from: clientUuid,
          to: packet.from,
          sdp 
        };

        sendPacket({ key: privateKey, packet: packetReturn });
      }
    });

    pc.addEventListener("datachannel", (event) => {
      console.log("ondatachannel", event);
      console.log("datachannel name =", event.channel.label);

      event.channel.addEventListener("open", () => {
        console.log("channel opened");
      });
    });

    pc.setRemoteDescription({ type: "offer", sdp: packet.sdp })
      .then(() => {
        return pc.createAnswer();
      })
      .then((answer) => {
        return pc.setLocalDescription(answer);
      });
  },

  answer ({ key, packet }) {
    console.log("got answer");

    if (!peerSessions[packet.from]) {
      throw Error("no correspoding peer session");
    }

    peerSessions[packet.from].processAnswer({ sdp: packet.sdp });
  }
};

const processPacket = ({ key, packet }) => {
  console.log("key =", key, "packet =", packet);

  const handler = handlers[packet.type];
  if (!handler) {
    throw Error(`unhandled packet type ${packet.type}`);
  }

  logPacket({ key, packet });
  handler({ key, packet });
};

wsc.on("message", (msg) => {
  console.log("msg =", msg);

  const msgAsBase64String = msg.toString("utf8");

  const msgAsBuffer = Buffer.from(msgAsBase64String, "base64");

  const decrypted = tryDecryptPacket({ packet: msgAsBuffer });
  if (decrypted) {
    const { key, data } = decrypted;

    const dataAsString = data.toString("utf8");
    const packet = JSON.parse(dataAsString);
    processPacket({ key, packet });
  }
});

const rsaTest = new NodeRSA();
rsaTest.importKey(privateKey);
rsaTest.importKey(publicKey);

const testBuffer = Buffer.alloc(1000);

const before = performance.now();

const times = 10000;

for(let i = 0; i < times; i += 1) {
  rsaTest.encrypt(testBuffer);
}

const after = performance.now();

const diff = after - before;
const speed = testBuffer.length * times * 1000 / diff;
console.log(`speed = ${speed.toFixed(2)} b/s`);

setInterval(() => {
  console.log("discoveredPeers =", discoveredPeers);
}, 3000);

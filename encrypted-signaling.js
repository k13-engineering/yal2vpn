import NodeRSA from "node-rsa";
import EventEmitter from "events";

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

const maybeDecrypt = ({ key, data }) => {
  try {
    return decrypt({ key, data });
  } catch (ex) {
    return undefined;
  }
};

const tryDecryptPacket = ({ publicKeys, packet }) => {
  let data = undefined;
  let key = undefined;

  Object.keys(publicKeys).some((name) => {
    key = publicKeys[name];
    data = maybeDecrypt({ key, data: packet });
    return data;
  });

  if (data) {
    return {
      key,
      data,
    };
  } else {
    return undefined;
  }
};

const create = ({ townhall, privateKey, publicKeys }) => {
  const emitter = new EventEmitter();

  const send = ({ packet }) => {
    const dataAsString = JSON.stringify(packet);
    const dataAsBuffer = Buffer.from(dataAsString, "utf8");

    const encrypted = encrypt({ key: privateKey, data: dataAsBuffer });

    townhall.send({ packet: encrypted });
  };

  townhall.on("connected", () => {
    emitter.emit("connected");
  });

  townhall.on("message", (msgAsBuffer) => {
    const decrypted = tryDecryptPacket({ publicKeys, packet: msgAsBuffer });
    if (decrypted) {
      const { key, data } = decrypted;
  
      const dataAsString = data.toString("utf8");
      const packet = JSON.parse(dataAsString);

      emitter.emit("message", { key, packet });
    }
  });

  return {
    send,
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
  };
};

export default {
  create,
};

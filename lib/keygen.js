import NodeRSA from "node-rsa";

const generateKeyPair = () => {
  const key = new NodeRSA();
  
  key.generateKeyPair();
  const privateKey = key.exportKey("openssh-private");
  const publicKey = key.exportKey("openssh-public");

  return {
    privateKey,
    publicKey
  };
};

export default {
  generateKeyPair,
};

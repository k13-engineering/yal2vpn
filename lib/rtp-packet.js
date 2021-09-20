const parse = ({ buffer }) => {
  const version = (buffer[0] & 0xc0) >>> 6;
  const padding = (buffer[0] & 0x20) >>> 5;
  const extensions = (buffer[0] & 0x16) >>> 4;
  const csrcCount = buffer[0] & 0xf;
  const marker = (buffer[1] & 0x80) >>> 7;
  const payloadType = buffer[1] & 0x7f;
  const sequenceNumber = buffer.readUInt16BE(2);
  const timestamp = buffer.readUInt32BE(4);
  const ssrc = buffer.readUInt32BE(8);
  const csrc = [];

  for (let i = 0; i < csrcCount; i += 1)
    csrc.push(buffer.readUInt32BE(12 + i * 4));

  const endCsrcIdx = 12 + csrcCount * 4;

  let headers = {
    version,
    padding,
    extensions,
    marker,
    payloadType,
    sequenceNumber,
    timestamp,
    ssrc,
    csrc,
    extension: null,
  };

  let payloadStartsAt = endCsrcIdx;
  if (extensions) {
    const extensionLength = buffer.readUInt16BE(endCsrcIdx + 2);

    headers = {
      ...headers,
      extension: {
        id: buffer.readUInt16BE(endCsrcIdx),
        data: buffer.slice(endCsrcIdx + 4, endCsrcIdx + 4 + extensionLength),
      }
    };

    payloadStartsAt += 4 + extensionLength;
  }

  const payload = buffer.slice(payloadStartsAt);

  return {
    ...headers,
    payload
  };
};

const format = ({ packet }) => {
  if (packet.extension) {
    throw Error("extensions not supported yet");
  }

  const header = Buffer.alloc(12);

  const byte0 =
    (packet.version << 6) |
    (packet.padding << 5) |
    (packet.extensions << 4) |
    (packet.csrcCount << 0);

  const byte1 = (packet.marker << 7) | (packet.payloadType << 0);

  header.writeUInt8(byte0, 0);
  header.writeUInt8(byte1, 1);
  header.writeUInt16BE(packet.sequenceNumber, 2);
  header.writeUInt32BE(packet.timestamp, 4);
  header.writeUInt32BE(packet.ssrc, 8);

  const csrcData = Buffer.alloc(4 * packet.csrc.length);
  for (let i = 0; i < packet.csrc.length; i += 1) {
    csrcData.writeUInt32BE(packet.csrc[i], i * 4);
  }

  return Buffer.concat([header, csrcData, packet.payload]);
};

export default {
  parse,
  format,
};

import naiveEmitter from "naive-emitter";
import tokenBucketFactory from "./token-bucket.js";

const create = ({
  send: sendToWire,
  bytesQueuedMinTreshold = 5000,
  bytesQueuedMaxThreshold = 10000,
}) => {
  const drainEmitter = naiveEmitter.create();
  // let tb;

  let tokenBucket;

  const configure = ({ maxBurstInBytes, rateInMbitPerSec }) => {
    const bucketCapacity = maxBurstInBytes;

    const rateInBytesPerMs = ((rateInMbitPerSec / 8) * 1000000) / 1000;
    const fillTimeInMs = Math.ceil(bucketCapacity / rateInBytesPerMs);

    tokenBucket = tokenBucketFactory.create({
      capacity: bucketCapacity,
      fillQuantity: bucketCapacity,
      fillTimeInMs,
      initialCapacity: tokenBucket ? Math.min(tokenBucket.tokensInBucket(), bucketCapacity) : bucketCapacity,
    });
  };

  configure({
    maxBurstInBytes: 64 * 1024,
    rateInMbitPerSec: 1,
  });

  let queue = [];
  let totalBytesQueued = 0;

  let drainSent = false;

  let nextTimeoutHandle = undefined;

  const sendNextToWire = () => {
    const packet = queue[0];
    queue = queue.slice(1);
    totalBytesQueued -= packet.length;

    sendToWire({ packet });

    if (totalBytesQueued < bytesQueuedMinTreshold && !drainSent) {
      drainEmitter.emit();
      drainSent = true;
    }
  };

  const maxPacketsPerTurn = 20;

  const maybeSendNext = ({ packetsSentInThisTurn = 0 } = {}) => {
    if (nextTimeoutHandle || queue.length === 0) {
      return;
    }

    const next = queue[0];
    // const result = tb.take(next.length);
    const result = tokenBucket.take({ tokens: next.length });

    if (result === 0) {
      sendNextToWire();

      if (packetsSentInThisTurn < maxPacketsPerTurn) {
        maybeSendNext({ packetsSentInThisTurn: packetsSentInThisTurn + 1 });
      } else {
        setImmediate(maybeSendNext);
      }
    } else {
      // logger.debug(`no tokens left in bucket, waiting ${result} ms`);
      nextTimeoutHandle = setTimeout(() => {
        nextTimeoutHandle = undefined;
        maybeSendNext();
      }, result);
    }
  };

  const send = ({ packet }) => {
    queue = [...queue, packet];
    totalBytesQueued += packet.length;

    maybeSendNext();

    const shouldDrain = totalBytesQueued > bytesQueuedMaxThreshold;
    if (shouldDrain) {
      drainSent = false;
    }

    return { shouldDrain };
  };

  return {
    onDrain: drainEmitter.on,

    configure,
    send,
  };
};

export default {
  create,
};

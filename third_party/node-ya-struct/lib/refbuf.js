const create = ({ links, size }) => {
  const buf = Buffer.alloc(size);

  buf.referencedBuffers = links;

  return buf;
};

export default {
  create
};

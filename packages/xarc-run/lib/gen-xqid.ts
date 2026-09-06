export default (tag?: any) => {
  return (
    (tag ? `${tag}_` : "") +
    Math.random()
      .toString(36)
      .substring(2, 12) +
    "_" +
    Date.now().toString(36)
  );
};

"use strict";

module.exports = tag => {
  return (
    (tag ? `${tag}_` : "") +
    Math.random()
      .toString(36)
      .substring(2, 12) +
    "_" +
    Date.now().toString(36)
  );
};

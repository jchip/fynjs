import * as stringArray from "string-array";

export default function pa(str) {
  return stringArray.parse(str, true, true).array; // noPrefix and noExtra
};

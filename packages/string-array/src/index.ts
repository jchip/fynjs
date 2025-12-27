export type StringArray = string | StringArray[];

export interface ParseResult {
  prefix: string;
  array: StringArray[];
  remain: string;
}

export function parse(str: string, noPrefix?: boolean, noExtra?: boolean): ParseResult {
  const nest: StringArray[][] = [];
  let arr: StringArray[] = [];
  let s = str.trim();

  if (!s) return { prefix: "", array: arr, remain: "" };

  let prefix = "";

  if (noPrefix !== true) {
    const ix = s.indexOf("[");

    if (ix > 0) {
      prefix = s.substring(0, ix).trim();
      s = s.substring(ix);
    }
  }

  while (true) {
    // start of an array
    if (s.startsWith("[")) {
      nest.push(arr);
      const newArr: StringArray[] = [];
      arr.push(newArr);
      arr = newArr;
      s = s.substring(1).trimStart();
      continue; // handle multiple consecutive ['s like [[[a]]]
    } else {
      if (nest.length === 0) {
        throw new Error("array missing [");
      }
    }

    // extract non-empty element up to ] or ,
    const m = s.match(/[\],]/);
    if (!m) {
      throw new Error("array missing ]");
    }
    const element = s.substring(0, m.index).trim();
    // if element is empty but there's , ahead then it's a legit empty element
    if (element || m[0] === ",") arr.push(element);

    s = s.substring(m.index! + 1).trimStart();

    // end of an array
    if (m[0] === "]") {
      const popped = nest.pop();
      if (!popped) {
        throw new Error("array has extra ]");
      }
      arr = popped;
      if (s.startsWith(",")) {
        s = s.substring(1).trimStart();
      }
    }

    if (!s) break;
    if (nest.length === 0) {
      if (noExtra === true) {
        throw new Error("extra data at end of array");
      }
      break;
    }
  }

  if (nest.length !== 0) {
    throw new Error("array missing ]");
  }

  return {
    prefix,
    array: arr[0] as StringArray[],
    remain: s
  };
}

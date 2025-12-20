"use strict";

const AveAzul = require("./lib/aveazul");
const bluebird = require("bluebird");

class MyClass {
  constructor() {
    this.name = "MyClass";
  }

  method1(cb) {
    cb(null, "result1");
  }
  method2(a, b, cb) {
    cb(null, a + b);
  }
  _privateMethod(cb) {
    cb(null, "private");
  }
}

MyClass.prototype.method2.hello = "world";

AveAzul.promisifyAll({ MyClass });

const instance = new MyClass();

console.log("instance.method2Async.hello", instance.method2Async.hello);

console.log("getPromisifiedKeys(instance)", getPromisifiedKeys(instance));

function _isClass(fn) {
  try {
    if (typeof fn === "function" && fn.toString().startsWith("class ")) {
      return true;
    }
  } catch (e) {
    // ignore
  }

  return false;
}

const thisAssignmentPattern = /this\s*\.\s*\S+\s*=/;
function isClass(fn) {
  try {
    if (typeof fn === "function") {
      const keys = Object.getOwnPropertyNames(fn.prototype);

      if (
        keys.length > 1 || // has methods
        // hasMethodsOtherThanConstructor
        (keys.length > 0 &&
          !(keys.length === 1 && keys[0] === "constructor")) ||
        // hasThisAssignmentAndStaticMethods
        (thisAssignmentPattern.test(fn + "") &&
          Object.getOwnPropertyNames(fn).length > 0)
      ) {
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

console.log("isClass(MyClass)", isClass(MyClass));

console.log("isClass(new MyClass())", isClass(new MyClass()));

function isConstructor(func) {
  return (
    !!func.prototype &&
    !!func.prototype.constructor.name &&
    func.prototype.constructor.name === func.name
  );
}

console.log("isConstructor(MyClass)", isConstructor(MyClass));
console.log("isConstructor(new MyClass())", isConstructor(new MyClass()));

const excludedPrototypes = [
  Array.prototype,
  Object.prototype,
  Function.prototype,
];

function getPromisifiedKeys(target) {
  const proto = Object.getPrototypeOf(target);
  const protoKeys = Object.getOwnPropertyNames(proto);
  const keys = Object.getOwnPropertyNames(target);
  const allKeys = [...protoKeys, ...keys];

  console.log(protoKeys);

  return allKeys;
}
console.log(getPromisifiedKeys(new MyClass()));

// AveAzul.promisifyAll(MyClass);

// const instance = new MyClass();
// const result1 = await instance.method1Async();
// const result2 = await instance.method2Async(1, 2);

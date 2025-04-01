class Test1 {
  constructor() {
    this.name = (err, cb) => "Test1";
  }

  test() {
    console.log("test");
  }

  foo() {
    console.log("foo");
  }

  _privateMethod() {
    console.log("private method");
  }

  static staticMethod1() {
    console.log("static method 1");
  }
}

Test1.staticMethod2 = () => "static method";

const test1 = new Test1();

test1.foo();

const proto = Object.getPrototypeOf(test1);

console.log("prototype", proto);

console.log("Object.keys of prototype", Object.keys(proto));

console.log("Object.keys of class instance", Object.keys(test1));

console.log(
  "getOwnPropertyNames of prototype",
  Object.getOwnPropertyNames(proto)
);

console.log(
  "getOwnPropertyNames of class definition",
  Object.getOwnPropertyNames(Test1)
);

const BB = require("bluebird");

console.log("promisifyAll a class instance", BB.promisifyAll(test1));

console.log(
  "promisifyAll a class instance with filter always return true",
  BB.promisifyAll(test1, { filter: (name, func) => true })
);

console.log("promisifyAll a class definition", BB.promisifyAll(Test1));

console.log(
  "promisifyAll a class definition with filter always return true",
  BB.promisifyAll(Test1, { filter: (name, func) => true })
);

function funcObject(obj) {}

funcObject.test1 = "hello";

funcObject.test2 = () => "world";

console.log("promisifyAll a function object", BB.promisifyAll(funcObject));

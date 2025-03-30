const AveAzul = require('../lib/aveazul');

describe('AveAzul', () => {
  describe('constructor', () => {
    test('should create a new AveAzul instance', () => {
      const promise = new AveAzul((resolve) => resolve(42));
      expect(promise).toBeInstanceOf(AveAzul);
      expect(promise).toBeInstanceOf(Promise);
    });

    test('should handle rejection in constructor', async () => {
      const error = new Error('test');
      const promise = new AveAzul((resolve, reject) => reject(error));
      await expect(promise).rejects.toBe(error);
    });
  });

  describe('instance methods', () => {
    test('tap() should execute side effects and return original value', async () => {
      const sideEffect = jest.fn();
      const result = await new AveAzul((resolve) => resolve(42))
        .tap(sideEffect);
      
      expect(sideEffect).toHaveBeenCalledWith(42);
      expect(result).toBe(42);
    });

    test('filter() should filter array elements', async () => {
      const result = await new AveAzul((resolve) => resolve([1, 2, 3, 4, 5]))
        .filter(x => x % 2 === 0);
      
      expect(result).toEqual([2, 4]);
    });

    test('map() should transform array elements', async () => {
      const result = await new AveAzul((resolve) => resolve([1, 2, 3]))
        .map(x => x * 2);
      
      expect(result).toEqual([2, 4, 6]);
    });

    test('return() should inject a new value', async () => {
      const result = await new AveAzul((resolve) => resolve(42))
        .return(100);
      
      expect(result).toBe(100);
    });

    test('each() should iterate over array elements', async () => {
      const sideEffect = jest.fn();
      const result = await new AveAzul((resolve) => resolve([1, 2, 3]))
        .each(sideEffect);
      
      expect(sideEffect).toHaveBeenCalledTimes(3);
      expect(sideEffect).toHaveBeenNthCalledWith(1, 1, 0);
      expect(sideEffect).toHaveBeenNthCalledWith(2, 2, 1);
      expect(sideEffect).toHaveBeenNthCalledWith(3, 3, 2);
      expect(result).toBeUndefined();
    });

    test('delay() should delay resolution', async () => {
      const start = Date.now();
      await new AveAzul((resolve) => resolve(42))
        .delay(101);
      const duration = Date.now() - start;
      
      expect(duration).toBeGreaterThanOrEqual(100);
    });

    test('timeout() should reject after specified time', async () => {
      const promise = new AveAzul((resolve) => setTimeout(() => resolve(42), 100))
        .timeout(50);
      
      await expect(promise).rejects.toThrow('Operation timed out');
    });

    test('timeout() should resolve if operation completes in time', async () => {
      const result = await new AveAzul((resolve) => setTimeout(() => resolve(42), 50))
        .timeout(100);
      
      expect(result).toBe(42);
    });

    test('timeout() should handle rejection', async () => {
      const error = new Error('test');
      const promise = new AveAzul((resolve, reject) => setTimeout(() => reject(error), 50))
        .timeout(100);
      
      await expect(promise).rejects.toBe(error);
    });

    test('try() should handle synchronous functions', async () => {
      const result = await new AveAzul((resolve) => resolve())
        .try(() => 42);
      
      expect(result).toBe(42);
    });

    test('try() should handle asynchronous functions', async () => {
      const result = await new AveAzul((resolve) => resolve())
        .try(() => Promise.resolve(42));
      
      expect(result).toBe(42);
    });

    test('try() should handle errors', async () => {
      const promise = new AveAzul((resolve) => resolve())
        .try(() => { throw new Error('test error'); });
      
      await expect(promise).rejects.toThrow('test error');
    });

    test('props() should resolve object properties', async () => {
      const result = await new AveAzul((resolve) => resolve())
        .props({
          a: Promise.resolve(1),
          b: Promise.resolve(2),
          c: 3
        });
      
      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });

    test('catchIf() should catch specific errors', async () => {
      const result = await new AveAzul((resolve, reject) => reject(new TypeError('test')))
        .catchIf(TypeError, () => 42);
      
      expect(result).toBe(42);
    });

    test('catchIf() should catch errors matching predicate function', async () => {
      const result = await new AveAzul((resolve, reject) => reject(new Error('test')))
        .catchIf(err => err.message === 'test', () => 42);
      
      expect(result).toBe(42);
    });

    test('catchIf() should rethrow unmatched errors', async () => {
      const error = new Error('test');
      const promise = new AveAzul((resolve, reject) => reject(error))
        .catchIf(TypeError, () => 42);
      
      await expect(promise).rejects.toBe(error);
    });

    test('tapCatch() should execute side effects on rejection', async () => {
      const sideEffect = jest.fn();
      const promise = new AveAzul((resolve, reject) => reject(new Error('test')))
        .tapCatch(sideEffect);
      
      await expect(promise).rejects.toThrow('test');
      expect(sideEffect).toHaveBeenCalled();
    });

    test('reduce() should reduce array elements', async () => {
      const result = await new AveAzul((resolve) => resolve([1, 2, 3, 4]))
        .reduce((acc, val) => acc + val, 0);
      
      expect(result).toBe(10);
    });

    test('reduce() should work without initial value', async () => {
      const result = await new AveAzul((resolve) => resolve([1, 2, 3, 4]))
        .reduce((acc, val) => acc + val, 0);
      
      expect(result).toBe(10);
    });

    test('throw() should return rejected promise', async () => {
      const promise = new AveAzul((resolve) => resolve())
        .throw(new Error('test'));
      
      await expect(promise).rejects.toThrow('test');
    });

    test('catchThrow() should catch and throw new error', async () => {
      const promise = new AveAzul((resolve, reject) => reject(new Error('original')))
        .catchThrow(new Error('new error'));
      
      await expect(promise).rejects.toThrow('new error');
    });

    test('catchReturn() should catch and return value', async () => {
      const result = await new AveAzul((resolve, reject) => reject(new Error('test')))
        .catchReturn(42);
      
      expect(result).toBe(42);
    });

    test('get() should retrieve property value', async () => {
      const result = await new AveAzul((resolve) => resolve({ a: { b: 42 } }))
        .get('a.b');
      
      expect(result).toBe(42);
    });

    test('get() should throw on null/undefined value', async () => {
      const promise = new AveAzul((resolve) => resolve(null))
        .get('a.b');
      
      await expect(promise).rejects.toThrow("Cannot read property 'a.b' of null");
    });

    test('get() should throw on undefined property', async () => {
      const promise = new AveAzul((resolve) => resolve({}))
        .get('a.b');
      
      await expect(promise).rejects.toThrow("Cannot read property 'b' of undefined");
    });

    test('get() should handle intermediate null/undefined values', async () => {
      const promise = new AveAzul((resolve) => resolve({ a: null }))
        .get('a.b');
      
      await expect(promise).rejects.toThrow("Cannot read property 'b' of null");
    });
  });

  describe('static methods', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('delay() should handle single argument using arguments object', async () => {
      const args = [101];
      const start = Date.now();
      await AveAzul.delay.apply(null, args);
      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(100);
    });

    test('delay() should handle single argument directly', async () => {
      const start = Date.now();
      await AveAzul.delay(101);
      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(100);
    });

    test('delay() should handle two arguments using arguments object', async () => {
      const args = [101, 42];
      const start = Date.now();
      const result = await AveAzul.delay.apply(null, args);
      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(100);
      expect(result).toBe(42);
    });

    test('reduce() should handle empty array without initial value', async () => {
      const result = await AveAzul.reduce([], (acc, val) => acc + val);
      expect(result).toBe(undefined);
    });

    test('reduce() should handle array with one element without initial value', async () => {
      const fn = jest.fn((acc, val) => acc === undefined ? val : acc + val);
      const result = await AveAzul.reduce([42], fn);
      expect(fn).toHaveBeenCalledWith(undefined, 42, 0, 1);
      expect(result).toBe(42);
    });

    test('reduce() should handle array with one element with initial value', async () => {
      const fn = jest.fn((acc, val) => acc + val);
      const result = await AveAzul.reduce([42], fn, 10);
      expect(fn).toHaveBeenCalledWith(10, 42, 0, 1);
      expect(result).toBe(52);
    });

    test('reduce() should handle array with multiple elements without initial value', async () => {
      const fn = jest.fn((acc, val) => acc === undefined ? val : acc + val);
      const result = await AveAzul.reduce([1, 2, 3], fn);
      expect(fn).toHaveBeenCalledTimes(3);
      expect(fn).toHaveBeenNthCalledWith(1, undefined, 1, 0, 3);
      expect(fn).toHaveBeenNthCalledWith(2, 1, 2, 1, 3);
      expect(fn).toHaveBeenNthCalledWith(3, 3, 3, 2, 3);
      expect(result).toBe(6);
    });

    test('reduce() should handle array with multiple elements with initial value', async () => {
      const fn = jest.fn((acc, val) => acc + val);
      const result = await AveAzul.reduce([1, 2, 3], fn, 10);
      expect(fn).toHaveBeenCalledTimes(3);
      expect(fn).toHaveBeenNthCalledWith(1, 10, 1, 0, 3);
      expect(fn).toHaveBeenNthCalledWith(2, 11, 2, 1, 3);
      expect(fn).toHaveBeenNthCalledWith(3, 13, 3, 2, 3);
      expect(result).toBe(16);
    });

    test('delay() should resolve after specified time', async () => {
      const start = Date.now();
      await AveAzul.delay(101);
      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(100);
    });

    test('delay() should resolve with optional value', async () => {
      const result = await AveAzul.delay(50, 42);
      expect(result).toBe(42);
    });

    test('try() should handle synchronous functions', async () => {
      const result = await AveAzul.try(() => 42);
      expect(result).toBe(42);
    });

    test('try() should handle asynchronous functions', async () => {
      const result = await AveAzul.try(() => Promise.resolve(42));
      expect(result).toBe(42);
    });

    test('try() should handle errors', async () => {
      const promise = AveAzul.try(() => { throw new Error('test error'); });
      await expect(promise).rejects.toThrow('test error');
    });

    test('props() should resolve object properties', async () => {
      const result = await AveAzul.props({
        a: Promise.resolve(1),
        b: Promise.resolve(2),
        c: 3
      });
      
      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });

    test('reduce() should reduce array elements', async () => {
      const result = await AveAzul.reduce([1, 2, 3, 4], (acc, val) => acc + val, 0);
      expect(result).toBe(10);
    });

    test('reduce() should work without initial value', async () => {
      const result = await AveAzul.reduce([1, 2, 3, 4], (acc, val) => acc + val, 0);
      expect(result).toBe(10);
    });

    test('throw() should return rejected promise', async () => {
      const promise = AveAzul.throw(new Error('test'));
      await expect(promise).rejects.toThrow('test');
    });

    test('promisify() should work with callback-style functions', async () => {
      const fn = (cb) => cb(null, 'success');
      const promisified = AveAzul.promisify(fn);
      const result = await promisified();
      expect(result).toBe('success');
    });

    test('promisify() should handle errors in callback-style functions', async () => {
      const error = new Error('test error');
      const fn = (cb) => cb(error);
      const promisified = AveAzul.promisify(fn);
      await expect(promisified()).rejects.toThrow(error);
    });

    test('promisify() should handle functions with multiple arguments', async () => {
      const fn = (a, b, cb) => cb(null, a + b);
      const promisified = AveAzul.promisify(fn);
      const result = await promisified(1, 2);
      expect(result).toBe(3);
    });

    test('promisify() should handle functions with no arguments', async () => {
      const fn = (cb) => cb(null, 'success');
      const promisified = AveAzul.promisify(fn);
      const result = await promisified();
      expect(result).toBe('success');
    });

    test('promisify() should preserve this context', async () => {
      const obj = {
        value: 42,
        fn(cb) {
          cb(null, this.value);
        }
      };
      const promisified = AveAzul.promisify(obj.fn, { context: obj });
      const result = await promisified();
      expect(result).toBe(42);
    });

    test('promisify() should handle functions with multiple arguments and context', async () => {
      const obj = {
        value: 42,
        fn(a, b, cb) {
          cb(null, this.value + a + b);
        }
      };
      const promisified = AveAzul.promisify(obj.fn, { context: obj });
      const result = await promisified(1, 2);
      expect(result).toBe(45);
    });

    test('defer() should create a deferred promise', async () => {
      const deferred = AveAzul.defer();
      setTimeout(() => deferred.resolve(42), 50);
      const result = await deferred.promise;
      expect(result).toBe(42);
    });

    test('defer() should handle rejection', async () => {
      const deferred = AveAzul.defer();
      const error = new Error('test');
      setTimeout(() => deferred.reject(error), 50);
      await expect(deferred.promise).rejects.toBe(error);
    });

    test('each() should iterate over array elements', async () => {
      const sideEffect = jest.fn();
      await AveAzul.each([1, 2, 3], sideEffect);
      expect(sideEffect).toHaveBeenCalledTimes(3);
      expect(sideEffect).toHaveBeenNthCalledWith(1, 1, 0);
      expect(sideEffect).toHaveBeenNthCalledWith(2, 2, 1);
      expect(sideEffect).toHaveBeenNthCalledWith(3, 3, 2);
    });

    test('map() should transform array elements', async () => {
      const result = await AveAzul.map([1, 2, 3], x => x * 2);
      expect(result).toEqual([2, 4, 6]);
    });
  });
}); 

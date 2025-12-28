import { EventEmitter } from "events";
import { WRAPPED_FN, IS_FINALLY, DEFER_EVENT, DEFER_OBJ } from "./symbols.ts";
export { WRAPPED_FN, IS_FINALLY, DEFER_EVENT, DEFER_WAIT, DEFER_OBJ } from "./symbols.ts";
export type CheckFunction = (...args: any[]) => any;
export type DoneCallback = (err?: Error | null, result?: any) => void;
export type NextCallback = (err?: Error | null, result?: any) => void;
export interface DeferHandlers {
    resolve: Array<(value: any) => void>;
    reject: Array<(err: Error) => void>;
}
export interface DeferObject {
    timeout?: number;
    event: EventEmitter;
    handlers: DeferHandlers;
    invoked?: boolean;
    failed?: boolean;
    error?: Error;
    result?: any;
    _waiting?: boolean;
    _waited?: boolean;
    [DEFER_EVENT]: EventEmitter;
    resolve(r?: any): void;
    reject(err: Error): void;
    onResolve(cb: (value: any) => void): DeferObject;
    onReject(cb: (err: Error) => void): DeferObject;
    pending(): boolean;
    clear(): () => void;
    setAwait(options: SetAwaitOptions): void;
    waitAgain(waitTimeout?: number): WaitFunction;
    wait(waitTimeout?: number, again?: boolean): WaitFunction;
}
interface SetAwaitOptions {
    resolve: (r: any) => void;
    reject: (err: Error) => void;
    errorFromCall: Error;
    timeoutMsg: string;
    waitTimeout?: number;
}
interface WaitFunction {
    (): Promise<any>;
    [DEFER_OBJ]: DeferObject;
    [DEFER_EVENT]: EventEmitter;
}
export interface WrapObject {
    [WRAPPED_FN]: CheckFunction;
    [IS_FINALLY]?: boolean;
    _expectError?: boolean | "has" | "toBe";
    _expectErrorMsg?: string;
    _withCallback?: boolean;
    _onFailVerify?: boolean;
    _timeout?: number;
    expectError?: WrapObject;
    withCallback?: WrapObject;
    onFailVerify?: WrapObject;
    expectErrorHas?(msg: string): WrapObject;
    expectErrorToBe?(msg: string): WrapObject;
    runTimeout?(delay: number): WrapObject;
}
export declare function runVerify(...args: any[]): void;
export declare function asyncVerify(...args: any[]): Promise<any>;
export declare function wrapAsyncVerify(...args: any[]): (x: any) => Promise<any>;
export declare function wrapVerify(...args: any[]): (x: any) => void;
export declare const wrapFn: (fn: CheckFunction) => WrapObject;
export declare const wrapCheck: (fn: CheckFunction) => WrapObject;
export declare const expectError: (fn: CheckFunction) => WrapObject;
export declare const expectErrorHas: (fn: CheckFunction, msg: string) => WrapObject;
export declare const expectErrorToBe: (fn: CheckFunction, msg: string) => WrapObject;
export declare const onFailVerify: (fn: CheckFunction) => WrapObject;
export declare const withCallback: (fn: CheckFunction) => WrapObject;
export declare const runTimeout: (delay: number, fn?: CheckFunction) => WrapObject;
export declare const runDefer: (timeout?: number) => DeferObject;
export declare const runFinally: (fn: CheckFunction) => WrapObject;

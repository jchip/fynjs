export type StringArray = string | StringArray[];
export interface ParseResult {
    prefix: string;
    array: StringArray[];
    remain: string;
}
export declare function parse(str: string, noPrefix?: boolean, noExtra?: boolean): ParseResult;

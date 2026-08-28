export interface NpmPublishOptions {
    exit?: boolean;
    silent?: boolean;
}
export declare function npmPublish({ exit, silent, }?: NpmPublishOptions): Promise<number>;

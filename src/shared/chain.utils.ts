export type Chain = string;

export class ChainUtils {
  static isEvm(chain: string){
    return ['bsc', 'base', 'ethereum'].includes(chain);
  }
}
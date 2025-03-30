import { Injectable } from "@nestjs/common";
import { ethers } from "ethers";

@Injectable()
export class EvmService {
  static verifySignature(
    message: string,
    signature: string,
    address: string
  ): boolean {
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === address.toLowerCase();
    } catch (error) {
      console.error("Signature verification error:", error);
      return false;
    }
  }

  static async signMessage(message: string, privateKey: string): Promise<string> {
    try {
      const wallet = new ethers.Wallet(privateKey);
      return await wallet.signMessage(message);
    } catch (error) {
      console.error("Signing error:", error);
      throw new Error("Failed to sign message");
    }
  }
}
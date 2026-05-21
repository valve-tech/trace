/** A single internal-function call detected within a CallFrame's opcode range. */
export interface InternalCall {
  stepIndex: number;
  funcName: string;
  line: number;
}

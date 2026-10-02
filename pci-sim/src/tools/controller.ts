/**
 * Device controller input: turns held keys, wheel notches and on-screen hold buttons into the
 * SimInput consumed by the simulation (the demo autopilot produces the same SimInput).
 */
import { emptyInput, type SimInput } from '../procedure/sim';
import type { HoldInput } from '../ui/devicePanel';

export class InputController {
  private held = new Set<string>();
  private wheel = 0;
  private deflate = false;
  pedalButton = false;

  keyDown(code: string): void {
    this.held.add(code);
    if (code === 'KeyQ') this.deflate = true;
  }

  keyUp(code: string): void {
    this.held.delete(code);
  }

  /** Wheel notches (+ = advance). */
  addWheel(n: number): void {
    this.wheel += n;
  }

  clear(): void {
    this.held.clear();
    this.wheel = 0;
    this.deflate = false;
    this.pedalButton = false;
  }

  get pedal(): boolean {
    return this.held.has('Space') || this.held.has('Digit6') || this.held.has('Numpad6') || this.pedalButton;
  }

  /** Build this frame's input and consume edge-triggered parts. */
  read(hold: HoldInput): SimInput {
    const h = this.held;
    const inp = emptyInput();
    inp.advance = (h.has('KeyW') ? 1 : 0) - (h.has('KeyS') ? 1 : 0) + hold.advance;
    inp.advance = Math.max(-1, Math.min(1, inp.advance));
    inp.rotate = Math.max(-1, Math.min(1, (h.has('KeyD') ? 1 : 0) - (h.has('KeyA') ? 1 : 0) + hold.rotate));
    inp.fine = h.has('ShiftLeft') || h.has('ShiftRight') || hold.fine;
    inp.inflate = h.has('KeyE') || hold.inflate;
    inp.deflate = this.deflate || hold.deflate;
    inp.pedal = this.pedal;
    inp.wheel = this.wheel;
    inp.carmLao = (h.has('ArrowRight') ? 1 : 0) - (h.has('ArrowLeft') ? 1 : 0);
    inp.carmCra = (h.has('ArrowUp') ? 1 : 0) - (h.has('ArrowDown') ? 1 : 0);
    this.wheel = 0;
    this.deflate = false;
    hold.deflate = false;
    return inp;
  }
}

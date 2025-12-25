/**
 * scene.ts — three.js visualization (brutalist)
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Guess } from "./types.ts";

const MAX_POINTS = 500;
const HOVER_THRESHOLD = 0.15; // distance threshold for point hover detection

export class SemanticScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  
  private localGeometry: THREE.BufferGeometry;
  private localPoints: THREE.Points;
  private localCount = 0;
  
  private outerGeometry: THREE.BufferGeometry;
  private outerPoints: THREE.Points;
  private outerCount = 0;
  
  private trailGeometry: THREE.BufferGeometry;
  private trailLine: THREE.Line;
  private trailCount = 0;
  
  private animationId: number | null = null;
  private isMobile = false;
  private isUserInteracting = false;
  private idleTimeout: number | null = null;
  
  // auto-rotation state (derived from camera position when resuming)
  private autoRotateAngle = 0;
  private autoRotateRadius = 3.5;
  private autoRotateHeight = 2;
  private autoRotateVerticalPhase = 0;
  
  // word tracking for hover tooltips
  private localWords: string[] = [];
  private outerWords: string[] = [];
  
  // raycasting for hover detection (desktop only)
  private raycaster: THREE.Raycaster;
  private mouse = new THREE.Vector2();
  private tooltip: HTMLElement | null = null;
  private _hoveredWord: string | null = null;
  
  /** get the currently hovered word (for external use) */
  get hoveredWord(): string | null {
    return this._hoveredWord;
  }
  
  constructor(container: HTMLElement) {
    // pure black scene
    this.scene = new THREE.Scene();

    // detect mobile
    this.isMobile = window.matchMedia("(max-width: 768px)").matches;
    
    // raycaster for hover detection
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points = { threshold: HOVER_THRESHOLD };
    
    // camera
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
    this.camera.position.set(2.5, 2, 2.5);
    
    // init auto-rotate state from starting camera position
    this.autoRotateAngle = Math.atan2(this.camera.position.z, this.camera.position.x);
    this.autoRotateRadius = Math.sqrt(
      this.camera.position.x ** 2 + this.camera.position.z ** 2
    );
    this.autoRotateHeight = this.camera.position.y;
    
    // renderer - no antialiasing for sharper look, transparent to let UI show through
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(1); // intentionally crisp
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.style.pointerEvents = "auto";
    canvas.style.touchAction = "none";
    container.appendChild(canvas);
    
    // controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 10;
    
    // enable controls for manual manipulation (UI will capture events when needed)
    this.controls.enabled = true;
    
    // track user interaction to pause auto-rotation
    this.controls.addEventListener("start", () => {
      this.isUserInteracting = true;
      if (this.idleTimeout) {
        window.clearTimeout(this.idleTimeout);
        this.idleTimeout = null;
      }
    });
    this.controls.addEventListener("end", () => {
      // resume auto-rotation after 3 seconds of idle
      this.idleTimeout = window.setTimeout(() => {
        // capture current camera state to resume smoothly from here
        const { x, y, z } = this.camera.position;
        this.autoRotateAngle = Math.atan2(z, x);
        this.autoRotateRadius = Math.sqrt(x * x + z * z);
        this.autoRotateHeight = y;
        // estimate vertical phase from current height offset
        this.autoRotateVerticalPhase = 0;
        this.isUserInteracting = false;
      }, 3000);
    });
    
    // no lights needed - using basic materials
    
    // local points (white to orange gradient)
    this.localGeometry = new THREE.BufferGeometry();
    this.localGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3)
    );
    this.localGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3)
    );
    this.localGeometry.setDrawRange(0, 0);
    
    const localMaterial = new THREE.PointsMaterial({
      size: 7,
      vertexColors: true,
      sizeAttenuation: false,
    });
    this.localPoints = new THREE.Points(this.localGeometry, localMaterial);
    this.scene.add(this.localPoints);
    
    // outer points (dim)
    this.outerGeometry = new THREE.BufferGeometry();
    this.outerGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3)
    );
    this.outerGeometry.setDrawRange(0, 0);
    
    const outerMaterial = new THREE.PointsMaterial({
      size: 4,
      color: 0x333333,
      sizeAttenuation: false,
    });
    this.outerPoints = new THREE.Points(this.outerGeometry, outerMaterial);
    this.scene.add(this.outerPoints);
    
    // trail line
    this.trailGeometry = new THREE.BufferGeometry();
    this.trailGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3)
    );
    this.trailGeometry.setDrawRange(0, 0);
    
    const trailMaterial = new THREE.LineBasicMaterial({
      color: 0x333333,
      linewidth: 2,
    });
    this.trailLine = new THREE.Line(this.trailGeometry, trailMaterial);
    this.scene.add(this.trailLine);
    
    // minimal wireframe cube instead of sphere
    const boxGeometry = new THREE.BoxGeometry(2, 2, 2);
    const boxEdges = new THREE.EdgesGeometry(boxGeometry);
    const boxMaterial = new THREE.LineBasicMaterial({ color: 0x222222, linewidth: 2 });
    const box = new THREE.LineSegments(boxEdges, boxMaterial);
    this.scene.add(box);
    
    // axis lines through center
    const axisLength = 1.2;
    const axisMaterial = new THREE.LineBasicMaterial({ color: 0x1a1a1a, linewidth: 2 });
    
    // x axis
    const xGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-axisLength, 0, 0),
      new THREE.Vector3(axisLength, 0, 0),
    ]);
    this.scene.add(new THREE.Line(xGeom, axisMaterial));
    
    // y axis
    const yGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -axisLength, 0),
      new THREE.Vector3(0, axisLength, 0),
    ]);
    this.scene.add(new THREE.Line(yGeom, axisMaterial));
    
    // z axis
    const zGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -axisLength),
      new THREE.Vector3(0, 0, axisLength),
    ]);
    this.scene.add(new THREE.Line(zGeom, axisMaterial));
    
    window.addEventListener("resize", this.onResize);
    
    // hover tooltip (desktop only)
    if (!this.isMobile) {
      this.createTooltip();
      canvas.addEventListener("mousemove", this.onMouseMove);
      canvas.addEventListener("mouseleave", this.onMouseLeave);
    }
    
    this.animate();
  }
  
  private onResize = () => {
    const container = this.renderer.domElement.parentElement;
    if (!container) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };
  
  private createTooltip() {
    this.tooltip = document.createElement("div");
    this.tooltip.className = "scene-tooltip";
    this.tooltip.style.cssText = `
      position: fixed;
      pointer-events: none;
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      padding: 4px 8px;
      font-family: monospace;
      font-size: 12px;
      border: 1px solid #333;
      z-index: 1000;
      display: none;
      white-space: nowrap;
    `;
    document.body.appendChild(this.tooltip);
  }
  
  private onMouseMove = (event: MouseEvent) => {
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    
    // normalize mouse coordinates to [-1, 1]
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // update raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // check intersections with local and outer points
    const localIntersects = this.raycaster.intersectObject(this.localPoints);
    const outerIntersects = this.raycaster.intersectObject(this.outerPoints);
    
    let word: string | null = null;
    
    // prefer local points (they're more important)
    if (localIntersects.length > 0 && localIntersects[0].index !== undefined) {
      const idx = localIntersects[0].index;
      if (idx < this.localWords.length) {
        word = this.localWords[idx];
      }
    } else if (outerIntersects.length > 0 && outerIntersects[0].index !== undefined) {
      const idx = outerIntersects[0].index;
      if (idx < this.outerWords.length) {
        word = this.outerWords[idx];
      }
    }
    
    this._hoveredWord = word;
    
    if (this.tooltip) {
      if (word) {
        this.tooltip.textContent = word;
        this.tooltip.style.display = "block";
        this.tooltip.style.left = `${event.clientX + 12}px`;
        this.tooltip.style.top = `${event.clientY + 12}px`;
      } else {
        this.tooltip.style.display = "none";
      }
    }
  };
  
  private onMouseLeave = () => {
    this._hoveredWord = null;
    if (this.tooltip) {
      this.tooltip.style.display = "none";
    }
  };
  
  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    
    // only auto-rotate when user isn't interacting
    if (!this.isUserInteracting) {
      // slow auto-rotation
      const rotationSpeed = this.isMobile ? 0.0003 : 0.0001;
      this.autoRotateAngle += rotationSpeed;
      this.autoRotateVerticalPhase += rotationSpeed * 0.7;
      
      // gentle vertical oscillation (small amplitude so it doesn't jump)
      const verticalOscillation = Math.sin(this.autoRotateVerticalPhase) * 0.3;
      
      // rotate from where user left off
      this.camera.position.x = Math.cos(this.autoRotateAngle) * this.autoRotateRadius;
      this.camera.position.z = Math.sin(this.autoRotateAngle) * this.autoRotateRadius;
      this.camera.position.y = this.autoRotateHeight + verticalOscillation;
      
      // look at the controls target (could be origin or win marker)
      this.camera.lookAt(this.controls.target);
    }
    
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
  
  addGuess(guess: Guess) {
    if (!guess.xyz) return;
    
    const { x, y, z } = guess.xyz;
    const word = guess.word;
    
    if (guess.kind === "local") {
      const positions = this.localGeometry.attributes.position as THREE.BufferAttribute;
      const colors = this.localGeometry.attributes.color as THREE.BufferAttribute;
      
      const i = this.localCount * 3;
      positions.array[i] = x;
      positions.array[i + 1] = y;
      positions.array[i + 2] = z;
      
      colors.array[i] = guess.color.r / 255;
      colors.array[i + 1] = guess.color.g / 255;
      colors.array[i + 2] = guess.color.b / 255;
      
      // store word for hover tooltip
      this.localWords.push(word);
      
      this.localCount++;
      this.localGeometry.setDrawRange(0, this.localCount);
      positions.needsUpdate = true;
      colors.needsUpdate = true;
      
      // trail
      const trailPositions = this.trailGeometry.attributes.position as THREE.BufferAttribute;
      const ti = this.trailCount * 3;
      trailPositions.array[ti] = x;
      trailPositions.array[ti + 1] = y;
      trailPositions.array[ti + 2] = z;
      
      this.trailCount++;
      this.trailGeometry.setDrawRange(0, this.trailCount);
      trailPositions.needsUpdate = true;
      
    } else {
      const positions = this.outerGeometry.attributes.position as THREE.BufferAttribute;
      
      const i = this.outerCount * 3;
      positions.array[i] = x;
      positions.array[i + 1] = y;
      positions.array[i + 2] = z;
      
      // store word for hover tooltip
      this.outerWords.push(word);
      
      this.outerCount++;
      this.outerGeometry.setDrawRange(0, this.outerCount);
      positions.needsUpdate = true;
    }
  }
  
  highlightWin(guess: Guess) {
    if (!guess.xyz) return;
    
    const { x, y, z } = guess.xyz;
    
    // simple box marker for win
    const geometry = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({ color: 0xff6600 });
    const marker = new THREE.LineSegments(edges, material);
    marker.position.set(x, y, z);
    this.scene.add(marker);
    
    this.controls.target.set(x, y, z);
  }
  
  dispose() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.idleTimeout !== null) {
      window.clearTimeout(this.idleTimeout);
    }
    window.removeEventListener("resize", this.onResize);
    
    // clean up tooltip and mouse events
    if (!this.isMobile) {
      const canvas = this.renderer.domElement;
      canvas.removeEventListener("mousemove", this.onMouseMove);
      canvas.removeEventListener("mouseleave", this.onMouseLeave);
      if (this.tooltip && this.tooltip.parentNode) {
        this.tooltip.parentNode.removeChild(this.tooltip);
      }
    }
    
    this.controls.dispose();
    this.renderer.dispose();
  }
}


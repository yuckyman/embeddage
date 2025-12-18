/**
 * scene.ts — three.js visualization (brutalist)
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Guess } from "./types.ts";

const MAX_POINTS = 500;

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
  
  constructor(container: HTMLElement) {
    // pure black scene
    this.scene = new THREE.Scene();

    // camera
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
    this.camera.position.set(2.5, 2, 2.5);
    
    // renderer - no antialiasing for sharper look, transparent to let UI show through
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(1); // intentionally crisp
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);
    
    // controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 10;
    
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
  
  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
  
  addGuess(guess: Guess) {
    if (!guess.xyz) return;
    
    const { x, y, z } = guess.xyz;
    
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
    window.removeEventListener("resize", this.onResize);
    this.renderer.dispose();
  }
}


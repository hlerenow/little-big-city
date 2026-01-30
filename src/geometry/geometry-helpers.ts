/**
 * Three.js几何体辅助工具
 * 
 * 功能说明：
 * - 提供几何体创建和操作的辅助函数
 * - 兼容原claygl的几何体API
 * - 简化常用几何体操作
 * 
 * @module geometry/geometry-helpers
 */
import * as THREE from 'three';

/**
 * Create a plane geometry (replaces claygl Plane)
 */
export function createPlaneGeometry(options: {
    widthSegments?: number;
    heightSegments?: number;
    width?: number;
    height?: number;
}): THREE.BufferGeometry {
    const width = options.width || 2;
    const height = options.height || 2;
    const widthSegments = options.widthSegments || 1;
    const heightSegments = options.heightSegments || 1;
    
    return new THREE.PlaneGeometry(width, height, widthSegments, heightSegments);
}

/**
 * Create a buffer geometry from extruded data
 */
export function createExtrudedGeometry(data: {
    position: Float32Array;
    normal: Float32Array;
    uv: Float32Array;
    indices: Uint16Array | Uint32Array;
}): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    
    geometry.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    
    return geometry;
}

/**
 * Manually update geometry vertices (for distortion effects)
 */
export function updateGeometryVertices(geometry: THREE.BufferGeometry): void {
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
}

/**
 * Get position attribute from geometry
 */
export function getPositionAttribute(geometry: THREE.BufferGeometry): Float32Array {
    return geometry.attributes.position.array as Float32Array;
}

/**
 * Set position attribute on geometry
 */
export function setPositionAttribute(geometry: THREE.BufferGeometry, positions: Float32Array): void {
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    updateGeometryVertices(geometry);
}

/**
 * Remove all children from a group (replaces node.removeAll())
 */
export function removeAllChildren(group: THREE.Group | THREE.Object3D): void {
    while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        
        // Dispose geometry and material if it's a mesh
        if (child instanceof THREE.Mesh) {
            if (child.geometry) {
                child.geometry.dispose();
            }
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose());
                } else {
                    child.material.dispose();
                }
            }
        }
    }
}

/**
 * Iterate each child (replaces node.eachChild())
 */
export function eachChild(group: THREE.Group | THREE.Object3D, callback: (child: THREE.Object3D) => void): void {
    group.children.forEach(callback);
}

/**
 * Create material with texture repeat
 */
export function createMaterialWithTexture(options: {
    map?: THREE.Texture;
    color?: string | number;
    roughness?: number;
    metalness?: number;
    uvRepeat?: [number, number];
}): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
        map: options.map,
        color: options.color || 0xffffff,
        roughness: options.roughness !== undefined ? options.roughness : 0.5,
        metalness: options.metalness !== undefined ? options.metalness : 0
    });
    
    if (options.map && options.uvRepeat) {
        options.map.wrapS = THREE.RepeatWrapping;
        options.map.wrapT = THREE.RepeatWrapping;
        options.map.repeat.set(options.uvRepeat[0], options.uvRepeat[1]);
    }
    
    return material;
}

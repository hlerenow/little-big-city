// Type declarations for third-party libraries without TypeScript support

declare module '@mapbox/vector-tile' {
    export class VectorTile {
        constructor(pbf: any);
        layers: any;
    }
}

declare module 'pbf' {
    export default class Protobuf {
        constructor(buffer: Uint8Array);
    }
}

// lru-cache v11+ uses named exports
declare module 'lru-cache' {
    export class LRUCache<K, V> {
        constructor(options: { max: number; [key: string]: any });
        get(key: K): V | undefined;
        set(key: K, value: V): void;
    }
}

declare module 'jszip' {
    export default class JSZip {
        file(name: string, data: any): void;
        generateAsync(options: any): Promise<Blob>;
    }
}

// geometry-extrude types are now handled by extrude-adapter.ts

declare module 'claygl-advanced-renderer' {
    export default class ClayAdvancedRenderer {
        constructor(renderer: any, scene: any, timeline: any, options?: any);
        render(): void;
        setShadow(options: any): void;
    }
}

declare module 'polybooljs' {
    const PolyBool: {
        polygonFromGeoJSON(geojson: any): any;
        polygonToGeoJSON(polygon: any): any;
        intersect(poly1: any, poly2: any): any;
    };
    export default PolyBool;
}

declare module 'quickhull3d' {
    function quickhull(points: number[][]): number[][];
    export default quickhull;
}

declare module 'maptalks' {
    export class TileLayer {
        constructor(id: string, options: any);
        getTiles(): any;
    }
    
    export class Map {
        constructor(container: string, options: any);
        setMinZoom(zoom: number): void;
        setMaxZoom(zoom: number): void;
        getCenter(): any;
        setCenter(center: any): void;
        pointToCoord(point: any): any;
        on(event: string, handler: Function): void;
    }
    
    const maptalks: any;
    export default maptalks;
}

declare module 'claygl/src/glmatrix/vec2' {
    const vec2: {
        sub(out: any, a: any, b: any): any;
        len(v: any): number;
        scale(out: any, v: any, s: number): any;
        scaleAndAdd(out: any, a: any, b: any, s: number): any;
    };
    export default vec2;
}

// Additional claygl type extensions
declare module 'claygl' {
    export const application: any;
    export const plugin: any;
    export const geometry: any;
    export class Texture2D {}
    
    export class Vector3 {
        array: number[] | Float32Array;
        x: number;
        y: number;
        z: number;
        constructor(x?: number, y?: number, z?: number);
        static set(out: Vector3, x: number, y: number, z: number): Vector3;
        static sub(out: Vector3, a: Vector3, b: Vector3): Vector3;
        static len(v: Vector3): number;
        static scale(out: Vector3, v: Vector3, s: number): Vector3;
        static scaleAndAdd(out: Vector3, a: Vector3, b: Vector3, s: number): Vector3;
        static transformMat4(out: Vector3, v: Vector3, m: any): Vector3;
        static normalize(out: Vector3, v: Vector3): Vector3;
        static ZERO: Vector3;
        normalize(): Vector3;
        scale(s: number): Vector3;
        lookAt(target: Vector3): void;
    }
    
    export class Geometry {
        attributes: any;
        indices: any;
        vertexCount: number;
        triangleCount: number;
        updateBoundingBox(): void;
        generateVertexNormals(): void;
        generateFaceNormals(): void;
        initIndicesFromArray(indices: number[]): void;
        getTriangleIndices(i: number, out: number[]): void;
        dirty(): void;
    }
}

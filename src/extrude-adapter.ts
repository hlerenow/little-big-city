/**
 * Adapter for poly-extrude to be compatible with geometry-extrude API
 */
import { extrudePolygons, extrudePolylines } from 'poly-extrude';

interface ExtrudeOptions {
    depth?: number | ((feature: any) => number);
    bevelSize?: number;
    bevelSegments?: number;
    simplify?: number;
    smoothSide?: boolean;
    smoothBevel?: boolean;
    excludeBottom?: boolean;
    lineWidth?: number;
    miterLimit?: number;
}

interface ExtrudeResult {
    position: Float32Array;
    normal: Float32Array;
    uv: Float32Array;
    indices: Uint16Array | Uint32Array;
    boundingRect?: { x: number; y: number; width: number; height: number };
}

interface GeoJSONExtrudeResult {
    polygon?: ExtrudeResult;
    polyline?: ExtrudeResult;
}

/**
 * Adapter for extrudePolygon to use poly-extrude
 */
export function extrudePolygon(
    polygons: any[],
    opts: ExtrudeOptions = {}
): ExtrudeResult {
    const depth = typeof opts.depth === 'function' ? opts.depth(0) : (opts.depth || 1);
    
    const result = extrudePolygons(polygons, {
        depth: depth,
        top: true  // Always generate top face
    });
    
    return {
        position: result.position,
        normal: result.normal,
        uv: result.uv,
        indices: result.indices,
        boundingRect: calculateBoundingRect(polygons)
    };
}

/**
 * Adapter for extrudeGeoJSON to use poly-extrude
 */
export function extrudeGeoJSON(
    geojson: any,
    opts: ExtrudeOptions = {}
): GeoJSONExtrudeResult {
    const result: GeoJSONExtrudeResult = {};
    const features = geojson.features || [];
    
    // Separate polygons and polylines
    const polygonFeatures: any[] = [];
    const polylineFeatures: any[] = [];
    
    features.forEach((feature: any) => {
        const geomType = feature.geometry?.type;
        if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
            polygonFeatures.push(feature);
        } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
            polylineFeatures.push(feature);
        }
    });
    
    // Extrude polygons - each polygon separately to support different depths
    if (polygonFeatures.length > 0) {
        const allPositions: number[] = [];
        const allNormals: number[] = [];
        const allUVs: number[] = [];
        const allIndices: number[] = [];
        let vertexOffset = 0;
        const allPolygons: any[] = [];
        
        polygonFeatures.forEach(feature => {
            const polygon = feature.geometry.type === 'Polygon' 
                ? feature.geometry.coordinates 
                : feature.geometry.coordinates[0]; // MultiPolygon - use first polygon
            
            allPolygons.push(polygon);
            
            // Calculate depth for this specific feature
            const depth = typeof opts.depth === 'function' 
                ? opts.depth(feature) 
                : (opts.depth || 1);
            
            // Extrude this single polygon
            // Note: 'top' controls the roof, should always be true for buildings
            // 'excludeBottom' only affects the bottom face
            const polyResult = extrudePolygons([polygon], {
                depth: depth,
                top: true  // Always generate top face (roof)
            });
            
            // Append positions
            for (let i = 0; i < polyResult.position.length; i++) {
                allPositions.push(polyResult.position[i]);
            }
            
            // Append normals
            for (let i = 0; i < polyResult.normal.length; i++) {
                allNormals.push(polyResult.normal[i]);
            }
            
            // Append UVs
            for (let i = 0; i < polyResult.uv.length; i++) {
                allUVs.push(polyResult.uv[i]);
            }
            
            // Append indices with offset
            for (let i = 0; i < polyResult.indices.length; i++) {
                allIndices.push(polyResult.indices[i] + vertexOffset);
            }
            
            // Update vertex offset for next polygon
            vertexOffset += polyResult.position.length / 3;
        });
        
        // Determine index array type based on vertex count
        const IndexArrayType = vertexOffset > 65535 ? Uint32Array : Uint16Array;
        
        result.polygon = {
            position: new Float32Array(allPositions),
            normal: new Float32Array(allNormals),
            uv: new Float32Array(allUVs),
            indices: new IndexArrayType(allIndices),
            boundingRect: calculateBoundingRect(allPolygons)
        };
    }
    
    // Extrude polylines
    if (polylineFeatures.length > 0) {
        const polylines = polylineFeatures.map(f => {
            if (f.geometry.type === 'LineString') {
                return f.geometry.coordinates;
            } else {
                // MultiLineString - return first line
                return f.geometry.coordinates[0];
            }
        });
        
        const depth = typeof opts.depth === 'function' 
            ? opts.depth(polylineFeatures[0]) 
            : (opts.depth || 1);
        
        const lineResult = extrudePolylines(polylines, {
            depth: depth,
            lineWidth: opts.lineWidth || 0.5,
            bottomStickGround: false
        });
        
        result.polyline = {
            position: lineResult.position,
            normal: lineResult.normal,
            uv: lineResult.uv,
            indices: lineResult.indices,
            boundingRect: calculateBoundingRect(polylines)
        };
    }
    
    return result;
}

/**
 * Calculate bounding rectangle for geometries
 */
function calculateBoundingRect(geometries: any[]): { x: number; y: number; width: number; height: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    function processCoordinates(coords: any) {
        if (Array.isArray(coords) && coords.length > 0) {
            if (typeof coords[0] === 'number') {
                // Single coordinate [x, y]
                minX = Math.min(minX, coords[0]);
                maxX = Math.max(maxX, coords[0]);
                minY = Math.min(minY, coords[1]);
                maxY = Math.max(maxY, coords[1]);
            } else {
                // Array of coordinates
                coords.forEach(processCoordinates);
            }
        }
    }
    
    geometries.forEach(geom => {
        processCoordinates(geom);
    });
    
    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
    };
}

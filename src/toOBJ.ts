import * as THREE from 'three';

const CREDIT = '# https://github.com/pissang/little-big-city\n';

interface ExportOptions {
    mtllib?: string;
    storeVertexColorInTexture?: boolean;
}

interface ExportResult {
    obj: string;
    mtl: string;
}

function quantizeArr(out: number[], arr: number[], precision: number): void {
    out[0] = Math.round(arr[0] * precision) / precision;
    out[1] = Math.round(arr[1] * precision) / precision;
    if (arr.length > 2) {
        out[2] = Math.round(arr[2] * precision) / precision;
    }
}

function phongFromRoughness(r?: number): number {
    if (r == null) {
        r = 1;
    }
    return Math.pow(1000.0, 1 - r);
}

function getMaterialParameters(material: any): Record<string, any> {
    const obj: Record<string, any> = {};
    const color = material.color || new THREE.Color(1, 1, 1);
    obj['Kd'] = `${color.r} ${color.g} ${color.b}`;
    // TODO
    obj['Ks'] = [1, 1, 1].join(' ');
    obj['Ns'] = phongFromRoughness(material.roughness);

    // Physically-based Rendering extension.
    if (material.metalness != null) {
        obj['Pm'] = material.metalness;
    }
    if (material.roughness != null) {
        obj['Pr'] = material.roughness;
    }
    return obj;
}

/**
 * Export ClayGL scene to OBJ format
 */
export default function exportGL2OBJ(scene: any, opts?: ExportOptions): ExportResult {
    opts = opts || {};
    opts.storeVertexColorInTexture = opts.storeVertexColorInTexture || false;
    opts.mtllib = opts.mtllib || 'material';

    let objStr = CREDIT;
    objStr += 'mtllib ' + opts.mtllib + '.mtl\n';

    const materialLib: Record<string, any> = {};
    const textureLib: Record<string, any> = {};
    let indexStart = 1;
    scene.traverse(function (mesh: any) {
        let parent = mesh;
        while (parent) {
            if ((parent as any).invisible || !parent.visible) {
                return;
            }
            parent = parent.parent;
        }

        if (mesh instanceof THREE.Mesh && mesh.geometry) {
            let materialName = mesh.material.name;
            objStr += 'o ' + mesh.name + '\n';

            materialLib[materialName] = getMaterialParameters(mesh.material);

            const vStr: string[] = [];
            const vtStr: string[] = [];
            const vnStr: string[] = [];

            let geometry = mesh.geometry;
            let positionAttr = geometry.attributes.position;
            let colorAttr = geometry.attributes.color;
            let normalAttr = geometry.attributes.normal;
            let texcoordAttr = geometry.attributes.uv;

            mesh.updateMatrixWorld(true);
            const normalMat = new THREE.Matrix4().copy(mesh.matrixWorld).invert().transpose();

            const pos = new THREE.Vector3();
            const nor = new THREE.Vector3();
            const col: number[] = [];
            const uv: number[] = [];

            const hasTexcoord = !!(texcoordAttr && texcoordAttr.array);
            const hasNormal = !!(normalAttr && normalAttr.array);
            const hasColor = !!(colorAttr && colorAttr.array);

            const tmp: number[] = [];
            const vertexCount = positionAttr.count;
            for (let i = 0; i < vertexCount; i++) {
                pos.fromArray(positionAttr.array as Float32Array, i * 3);

                pos.applyMatrix4(mesh.matrixWorld);

                // PENDING
                quantizeArr(tmp, pos.toArray(), 1e5);
                let vItem = 'v ' + tmp.join(' ');
                if (hasColor && !opts.storeVertexColorInTexture) {
                    col[0] = colorAttr.getX(i);
                    col[1] = colorAttr.getY(i);
                    col[2] = colorAttr.getZ(i);
                    quantizeArr(col, col, 1e3);
                    vItem += ' ' + col.join(' ');
                }
                vStr.push(vItem);

                if (hasNormal) {
                    nor.fromArray(normalAttr.array as Float32Array, i * 3);
                    nor.applyMatrix4(normalMat);
                    nor.normalize();
                    quantizeArr(tmp, nor.toArray(), 1e3);
                    vnStr.push('vn ' + tmp.join(' '));
                }
                else {
                    vnStr.push('vn 0 0 0');
                }
                if (hasTexcoord) {
                    uv[0] = texcoordAttr.getX(i);
                    uv[1] = texcoordAttr.getY(i);
                    quantizeArr(uv, uv, 1e5);
                    vtStr.push('vt ' + uv.join(' '));
                }
                else {
                    vtStr.push('vt 0 0');
                }
            }

            const fStr: string[] = [];
            const index = geometry.index;
            const triangleCount = index ? index.count / 3 : vertexCount / 3;
            
            for (let i = 0; i < triangleCount; i++) {
                const indices: any[] = [];
                for (let k = 0; k < 3; k++) {
                    const vertexIndex = index ? index.getX(i * 3 + k) : i * 3 + k;
                    const idx = vertexIndex + indexStart;
                    indices[k] = idx + '/' + idx + '/' + idx;
                }
                fStr.push('f ' + indices.join(' '));
            }

            objStr += vStr.join('\n') + '\n'
                + vnStr.join('\n') + '\n'
                + vtStr.join('\n') + '\n'
                + 'usemtl ' + materialName + '\n'
                + fStr.join('\n') + '\n';

            indexStart += vertexCount;
        }
    });

    const mtlStr: string[] = [
        CREDIT
    ];
    for (const matName in materialLib) {
        const material = materialLib[matName];
        mtlStr.push('newmtl ' + matName);
        for (const key in material) {
            const val = material[key];
            mtlStr.push(key + ' ' + val);
        }
    }

    return {
        obj: objStr,
        mtl: mtlStr.join('\n')
    };
};
// Flow host script: reads and writes cubic-bezier easing on selected keyframes.
// Returns plain strings ("ok:..." / "err:<code>") because ExtendScript has no reliable JSON.

var MIN_INFLUENCE = 0.1;

function flowClampInfluence(v) {
    return Math.max(MIN_INFLUENCE, Math.min(100, v * 100));
}

// Number of KeyframeEase objects AE expects for this property.
function flowEaseDims(prop) {
    var t = prop.propertyValueType;
    if (t === PropertyValueType.TwoD) return 2;
    if (t === PropertyValueType.ThreeD) return 3;
    return 1;
}

function flowBezierLength(p0, p1, p2, p3) {
    var steps = 24, len = 0, prev = p0;
    for (var s = 1; s <= steps; s++) {
        var t = s / steps, u = 1 - t, pt = [];
        for (var i = 0; i < p0.length; i++) {
            pt.push(u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i]);
        }
        var d = 0;
        for (var j = 0; j < pt.length; j++) d += (pt[j] - prev[j]) * (pt[j] - prev[j]);
        len += Math.sqrt(d);
        prev = pt;
    }
    return len;
}

// Value change across a segment, one entry per ease dimension.
// Spatial speed in AE is measured along the motion path, so that case uses arc length.
function flowDeltas(prop, a, b) {
    var t = prop.propertyValueType;
    var v0 = prop.keyValue(a), v1 = prop.keyValue(b);
    var i, out = [];

    if (t === PropertyValueType.TwoD_SPATIAL || t === PropertyValueType.ThreeD_SPATIAL) {
        var outTan = prop.keyOutSpatialTangent(a), inTan = prop.keyInSpatialTangent(b);
        var c1 = [], c2 = [];
        for (i = 0; i < v0.length; i++) {
            c1.push(v0[i] + outTan[i]);
            c2.push(v1[i] + inTan[i]);
        }
        return [flowBezierLength(v0, c1, c2, v1)];
    }
    if (t === PropertyValueType.TwoD || t === PropertyValueType.ThreeD) {
        for (i = 0; i < v0.length; i++) out.push(v1[i] - v0[i]);
        return out;
    }
    if (t === PropertyValueType.OneD) return [v1 - v0];
    if (t === PropertyValueType.COLOR) {
        var d = 0;
        for (i = 0; i < v0.length; i++) d += (v1[i] - v0[i]) * (v1[i] - v0[i]);
        return [Math.sqrt(d)];
    }
    return [0];
}

function flowApplySegment(prop, a, b, x1, y1, x2, y2, setOut, setIn) {
    var dur = prop.keyTime(b) - prop.keyTime(a);
    if (dur <= 0) return false;

    var deltas = flowDeltas(prop, a, b);
    var dims = flowEaseDims(prop);
    var outInf = flowClampInfluence(x1), inInf = flowClampInfluence(1 - x2);
    var outSlope = y1 / (outInf / 100), inSlope = (1 - y2) / (inInf / 100);
    var outEase = [], inEase = [];
    for (var i = 0; i < dims; i++) {
        var rate = (deltas[i] !== undefined ? deltas[i] : 0) / dur;
        outEase.push(new KeyframeEase(outSlope * rate, outInf));
        inEase.push(new KeyframeEase(inSlope * rate, inInf));
    }

    var BEZ = KeyframeInterpolationType.BEZIER;
    if (setOut) {
        prop.setTemporalContinuousAtKey(a, false);
        prop.setTemporalAutoBezierAtKey(a, false);
        prop.setInterpolationTypeAtKey(a, prop.keyInInterpolationType(a), BEZ);
        prop.setTemporalEaseAtKey(a, prop.keyInTemporalEase(a), outEase);
    }
    if (setIn) {
        prop.setTemporalContinuousAtKey(b, false);
        prop.setTemporalAutoBezierAtKey(b, false);
        prop.setInterpolationTypeAtKey(b, BEZ, prop.keyOutInterpolationType(b));
        prop.setTemporalEaseAtKey(b, inEase, prop.keyOutTemporalEase(b));
    }
    return true;
}

function flowSelectedKeyProps() {
    var comp = app.project.activeItem;
    if (!(comp && comp instanceof CompItem)) return null;
    var result = [], props = comp.selectedProperties;
    for (var i = 0; i < props.length; i++) {
        var p = props[i];
        if (p instanceof Property && p.numKeys > 1 && p.selectedKeys.length > 0) result.push(p);
    }
    return result;
}

// mode: "both" | "in" | "out"
function flowApply(x1, y1, x2, y2, mode) {
    var props = flowSelectedKeyProps();
    if (props === null) return "err:nocomp";
    if (!props.length) return "err:nokeys";

    var wantOut = mode !== "in", wantIn = mode !== "out";
    var segments = 0;

    app.beginUndoGroup("Makiease: easing");
    try {
        for (var i = 0; i < props.length; i++) {
            var prop = props[i], sel = prop.selectedKeys, k;
            if (sel.length === 1) {
                // A lone key: ease the side of each neighbouring segment that touches it.
                k = sel[0];
                if (k > 1 && wantIn && flowApplySegment(prop, k - 1, k, x1, y1, x2, y2, false, true)) segments++;
                if (k < prop.numKeys && wantOut && flowApplySegment(prop, k, k + 1, x1, y1, x2, y2, true, false)) segments++;
                continue;
            }
            for (var s = 0; s < sel.length - 1; s++) {
                if (sel[s + 1] !== sel[s] + 1) continue;
                if (flowApplySegment(prop, sel[s], sel[s + 1], x1, y1, x2, y2, wantOut, wantIn)) segments++;
            }
        }
    } catch (e) {
        app.endUndoGroup();
        return "err:" + e.toString();
    }
    app.endUndoGroup();
    return segments ? "ok:" + segments : "err:nosegments";
}

// Reads the curve of the first selected segment back as x1,y1,x2,y2.
function flowRead() {
    var props = flowSelectedKeyProps();
    if (props === null) return "err:nocomp";
    if (!props.length) return "err:nokeys";

    var prop = props[0], sel = prop.selectedKeys;
    var a = sel[0], b = a + 1;
    if (b > prop.numKeys) {
        b = a;
        a = a - 1;
    }
    var dur = prop.keyTime(b) - prop.keyTime(a);
    var deltas = flowDeltas(prop, a, b);
    var dim = 0;
    for (var i = 0; i < deltas.length; i++) {
        if (Math.abs(deltas[i]) > 1e-9) {
            dim = i;
            break;
        }
    }
    var delta = deltas[dim];
    var outE = prop.keyOutTemporalEase(a)[dim], inE = prop.keyInTemporalEase(b)[dim];

    var x1 = outE.influence / 100, x2 = 1 - inE.influence / 100;
    var y1 = 0, y2 = 1;
    if (Math.abs(delta) > 1e-9 && dur > 0) {
        var rate = delta / dur;
        y1 = outE.speed / rate * x1;
        y2 = 1 - inE.speed / rate * (1 - x2);
    }
    return "ok:" + [x1, y1, x2, y2].join(",");
}

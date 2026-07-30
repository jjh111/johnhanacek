/*
 * shape-detection.js — shared stroke/shape recognition math ("ShapeDetect").
 *
 * Single source for the recognition geometry that was previously copy-pasted
 * between index.html (fish minigame) and design.html (blueprint canvas), and
 * is also used by the index.html QR easter egg. Extracted in v1.8 (V2 plan,
 * workstream B); the index.html versions were kept where the two pages had
 * diverged (getTriangleScore — the tightened window that stops fish-loop
 * strokes registering as triangles).
 *
 * Pure functions only — no DOM, no state. Consumers destructure what they need:
 *   const { getBounds, distance, detectShape, ... } = window.ShapeDetect;
 */
(function () {
    function getBounds(points) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });
        return { minX, minY, maxX, maxY };
    }

    function distance(a, b) {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }

    function getCircleScore(points, center, radius) {
        let totalError = 0;
        points.forEach(p => {
            const dist = distance(p, center);
            totalError += Math.abs(dist - radius) / radius;
        });
        return Math.max(0, 1 - (totalError / points.length));
    }

    function getRectScore(points, bounds) {
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;
        let cornerCount = 0;
        const corners = [
            { x: bounds.minX, y: bounds.minY },
            { x: bounds.maxX, y: bounds.minY },
            { x: bounds.maxX, y: bounds.maxY },
            { x: bounds.minX, y: bounds.maxY }
        ];
        const threshold = Math.max(width, height) * 0.15;
        corners.forEach(corner => {
            if (points.some(p => distance(p, corner) < threshold)) cornerCount++;
        });
        return cornerCount / 4;
    }

    function getTriangleScore(points, bounds) {
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;

        // Count sharp corners — tightened window (0.5–2.3 rad) avoids
        // picking up the gradual curves of fish-loop strokes
        let turns = 0;
        const step = Math.max(1, Math.floor(points.length / 20));
        for (let i = step; i < points.length - step; i += step) {
            const prev = points[i - step];
            const curr = points[i];
            const next = points[Math.min(i + step, points.length - 1)];
            const angle1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
            const angle2 = Math.atan2(next.y - curr.y, next.x - curr.x);
            let diff = Math.abs(angle2 - angle1);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            if (diff > 0.5 && diff < 2.3) turns++;
        }

        // Aspect ratio check - triangles shouldn't be too thin
        const aspect = Math.min(width, height) / Math.max(width, height);
        const aspectOk = aspect > 0.3;

        // Graded score: exactly 3 corners = clear triangle, 2 or 4 = marginal
        if (turns === 3 && aspectOk) return 0.75;
        if ((turns === 2 || turns === 4) && aspectOk) return 0.58;
        return 0.2;
    }

    function getLineScore(points) {
        if (points.length < 3) return 0;
        const start = points[0];
        const end = points[points.length - 1];
        const lineLen = distance(start, end);
        if (lineLen < 30) return 0;

        let totalDev = 0;
        points.forEach(p => {
            const t = Math.max(0, Math.min(1,
                ((p.x - start.x) * (end.x - start.x) + (p.y - start.y) * (end.y - start.y)) / (lineLen * lineLen)
            ));
            const proj = { x: start.x + t * (end.x - start.x), y: start.y + t * (end.y - start.y) };
            totalDev += distance(p, proj);
        });
        return Math.max(0, 1 - (totalDev / points.length) / (lineLen * 0.1));
    }

    function detectArrowHead(points) {
        if (points.length < 10) return false;
        const last10 = points.slice(-10);
        const end = points[points.length - 1];
        const beforeEnd = points[Math.max(0, points.length - 8)];
        const mainDir = Math.atan2(end.y - beforeEnd.y, end.x - beforeEnd.x);

        // Check for splaying at end
        let hasSplay = false;
        for (let i = 1; i < last10.length - 1; i++) {
            const dir = Math.atan2(last10[i].y - end.y, last10[i].x - end.x);
            const diff = Math.abs(dir - mainDir);
            if (diff > 0.4 && diff < 2.7) hasSplay = true;
        }
        return hasSplay;
    }

    function detectShape(points) {
        if (points.length < 5) return null;

        const bounds = getBounds(points);
        const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;
        const size = Math.max(width, height);

        if (size < 20) return null; // Too small

        // Check if closed (start near end)
        const start = points[0];
        const end = points[points.length - 1];
        const closedThreshold = size * 0.25;
        const isClosed = distance(start, end) < closedThreshold;

        if (isClosed) {
            // Analyze closed shape
            const circleScore = getCircleScore(points, center, size / 2);
            const rectScore = getRectScore(points, bounds);
            const triScore = getTriangleScore(points, bounds);

            if (circleScore > 0.7 && circleScore > rectScore && circleScore > triScore) {
                return { type: 'circle', center, radius: size / 2, confidence: circleScore };
            }
            if (rectScore > 0.6 && rectScore > triScore) {
                return { type: 'rectangle', bounds, center, confidence: rectScore };
            }
            if (triScore > 0.5) {
                return { type: 'triangle', bounds, center, confidence: triScore };
            }
        } else {
            // Open shape - line or arrow
            const lineScore = getLineScore(points);
            if (lineScore > 0.7) {
                const hasArrow = detectArrowHead(points);
                return {
                    type: hasArrow ? 'arrow' : 'line',
                    start, end, center,
                    confidence: lineScore
                };
            }
        }

        return null;
    }

    // Check if two line segments intersect, return intersection point
    function segmentsIntersect(p1, p2, p3, p4, returnPoint = false) {
        const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
        if (Math.abs(d) < 0.001) return returnPoint ? null : false;
        const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
        const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / d;
        if (t > 0 && t < 1 && u > 0 && u < 1) {
            if (returnPoint) {
                return {
                    x: p1.x + t * (p2.x - p1.x),
                    y: p1.y + t * (p2.y - p1.y)
                };
            }
            return true;
        }
        return returnPoint ? null : false;
    }

    // Detect self-intersection and find loop center (fish body pivot)
    // Returns { loopCenter, loopStart, loopEnd, intersectionPoint } or null
    function findSelfIntersectionLoop(points) {
        if (points.length < 10) return null;

        // For short/fast strokes (< 80 pts) scan every point pair — O(n²) is cheap here (80²=6400).
        // For long strokes subsample to stay performant.
        const step = points.length < 80 ? 1 : Math.max(2, Math.floor(points.length / 60));

        for (let i = 0; i < points.length - step * 4; i += step) {
            const a1 = points[i];
            const a2 = points[Math.min(i + step, points.length - 1)];

            for (let j = i + step * 3; j < points.length - step; j += step) {
                const b1 = points[j];
                const b2 = points[Math.min(j + step, points.length - 1)];

                const intersection = segmentsIntersect(a1, a2, b1, b2, true);
                if (intersection) {
                    // Found intersection - extract the loop (points between i and j)
                    const loopPoints = points.slice(i, j + 1);

                    // Check loop is curved (not sharp angular)
                    // Use finer sampling to catch sharp corners reliably
                    let totalAngleChange = 0;
                    let maxSingleChange = 0;
                    const sampleStep = Math.max(1, Math.floor(loopPoints.length / 20));
                    let sampleCount = 0;
                    for (let k = sampleStep; k < loopPoints.length - sampleStep; k += sampleStep) {
                        const prev = loopPoints[k - sampleStep];
                        const curr = loopPoints[k];
                        const next = loopPoints[Math.min(k + sampleStep, loopPoints.length - 1)];
                        const a1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
                        const a2 = Math.atan2(next.y - curr.y, next.x - curr.x);
                        let diff = Math.abs(a2 - a1);
                        if (diff > Math.PI) diff = 2 * Math.PI - diff;
                        if (diff > maxSingleChange) maxSingleChange = diff;
                        totalAngleChange += diff;
                        sampleCount++;
                    }

                    // Reject if too angular: average per-sample change too high.
                    // Small loops have few points → each sample covers a larger arc → threshold must be
                    // more lenient to avoid rejecting valid tight fish loops.
                    const avgAngleChange = sampleCount > 0 ? totalAngleChange / sampleCount : 0;
                    // Scale thresholds: small loops (≤6 samples) get more headroom
                    const angleScale = sampleCount <= 6 ? 1.4 : sampleCount <= 10 ? 1.2 : 1.0;
                    if (avgAngleChange > 0.65 * angleScale) continue; // Too sharp on average
                    if (maxSingleChange > 1.1 * angleScale) continue; // Single corner too sharp

                    // Calculate loop centroid (fish body center)
                    let cx = 0, cy = 0;
                    loopPoints.forEach(p => { cx += p.x; cy += p.y; });
                    cx /= loopPoints.length;
                    cy /= loopPoints.length;

                    // Check loop has decent size
                    const loopBounds = getBounds(loopPoints);
                    const loopW = loopBounds.maxX - loopBounds.minX;
                    const loopH = loopBounds.maxY - loopBounds.minY;
                    const loopSize = Math.max(loopW, loopH);
                    if (loopSize < 18) continue; // Loop too small

                    // Aspect ratio — rejects tiny crossings on long thin lines
                    const loopAspect = Math.min(loopW, loopH) / (Math.max(loopW, loopH) + 0.001);

                    return {
                        loopCenter: { x: cx, y: cy },
                        loopStart: i,
                        loopEnd: j,
                        intersectionPoint: intersection,
                        loopSize: loopSize,
                        loopAspect: loopAspect
                    };
                }
            }
        }
        return null;
    }

    window.ShapeDetect = {
        getBounds,
        distance,
        getCircleScore,
        getRectScore,
        getTriangleScore,
        getLineScore,
        detectArrowHead,
        detectShape,
        segmentsIntersect,
        findSelfIntersectionLoop
    };
})();

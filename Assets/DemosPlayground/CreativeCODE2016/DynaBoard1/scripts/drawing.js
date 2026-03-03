var path;
var hitOptions = {
    segments: true,
    stroke: true,
    fill: true,
    tolerance: 5
};
var textItem = new PointText({
    content: 'Click and drag to draw a line.',
    point: new Point(20, 30),
    fillColor: 'black',

});

//The dot
var path = new Path.Circle(new Point(5, 5), 2);
path.fillColor = 'black';
var dot = new Symbol(path);

//the 2D primitves
var triangle = new Path.RegularPolygon(new Point(80, 70), 3, 50);
var tri = new Symbol(triangle);

var circle = new Path.Circle(new Point(100, 70), 50);
circle.fillColor = 'black';
var circ = new Symbol(circle);
/*var segment, path;
var movePath = false;
*/
function onMouseDown(event) {
    // If we produced a path before, deselect it:
    //if (path) {
    //    path.selected = false;
  //  }

    // Create a new path and set its stroke color to black:
    path = new Path({
        segments: [event.point],
        strokeColor: 'black',
        strokeWidth: 3
        // Select the path, so we can see its segment points:
        //path.fullySelected: true;
    });

    segment = path = null;
    var hitResult = project.hitTest(event.point, hitOptions);
    if (!hitResult)
        return;

    if (event.modifiers.shift) {
        if (hitResult.type == 'segment') {
            hitResult.segment.remove();
        };
        return;
    }

    if (hitResult) {
        path = hitResult.item;
        if (hitResult.type == 'segment') {
            segment = hitResult.segment;
        } else if (hitResult.type == 'stroke') {
            var location = hitResult.location;
            segment = path.insert(location.index + 1, event.point);
            path.smooth();
        }
    }
    movePath = hitResult.type == 'fill';
    if (movePath)
       project.activeLayer.addChild(hitResult.item);

}

//highlight path
function onMouseMove(event) {
    project.activeLayer.selected = false;
    if (event.item)
        event.item.selected = true;
}
// While the user drags the mouse, points are added to the path
// at the position of the mouse:
function onMouseDrag(event) {
    path.add(event.point);
    /*if (segment) {
        segment.point += event.delta;
        path.smooth();
    } else if (path) {
        path.position += event.delta;
    }
    */
    // Update the content of the text item to show how many
    // segments it has
    textItem.content = 'Segment count: ' + path.segments.length + "\n" + 'Segment contents' + path.segments;
}

// When the mouse is released, we simplify the path:
function onMouseUp(event) {
    var segmentCount = path.segments.length;

    if (path.segments.length > 5) {path.toShape([true]);
    }else if (path.segments.length < 5) {
      dot.place(new Point(event.point));}
    /*
    if (path.segments.length > 5) {path.simplify([10]);
    }else if (path.segments.length < 5) {
      dot.place(new Point(event.point));}
*/


    var newSegmentCount = path.segments.length;
    var difference = segmentCount - newSegmentCount;
    var percentage = 100 - Math.round(newSegmentCount / segmentCount * 100);
    textItem.content = difference + ' of the ' + segmentCount + ' segments were removed. Saving ' + percentage + '%'+ "\n" + 'Segment contents' + path.segments;
    // When the mouse is released, simplify it:
    //path.simplify(15);
    console.log(path.segments);
    // Select the path, so we can see its segments:
    //path.fullySelected = true;
}

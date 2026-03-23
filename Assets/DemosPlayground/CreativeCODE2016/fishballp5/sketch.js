//John Hanacek
var img;
var vid;
var theta = 0;
var yoff = 0.0; // 2nd dimension of perlin noise


function setup() {
  createCanvas(1200, 900, WEBGL);
  img = loadImage("assets/fishBall.jpg");
}

function draw() {
  background(250);

  var locY = (mouseY / height - 0.5) * (-2);
  var locX = (mouseX / width - 0.5) * 2;



  /*ambientLight(400);
  directionalLight(200, 0, 0, 0.25, 0.25, 0.25);
  specularMaterial(250,0,0);
  pointLight(0, 0, 200, locX, locY, 0);
  pointLight(200, 200, 0, -locX, -locY, 0);
*/
  //background(46, 92, 50);
  fill(46, 92, 90);
  //noStroke();
  // We are going to draw a polygon out of the wave points
  beginShape();

  //var xoff = 0; // Option #1: 2D Noise
  var xoff = yoff; // Option #2: 1D Noise

  // Iterate over horizontal pixels
  for (var x = 0; x <= width; x += 10) {
    // Calculate a y value according to noise, map to

    // Option #1: 2D Noise
    //var y = map(noise(xoff, yoff), 0, 1, 200, 300);

    // Option #2: 1D Noise
    var y = map(noise(xoff), 0, 1, 200, 500);

    // Set the vertex
    vertex(x, y);
    // Increment x dimension for noise
    xoff += 0.02;
  }
  // increment y dimension for noise
  yoff += 0.01;
  vertex(width, height);
  vertex(0, height);
  endShape(CLOSE);

  function touchMoved() {
    var locY = (MouseX / height - 0.5) * (-2);
    var locX = (MouseY / height - 0.5) * (-2);
    rotateZ(pmouseX / pmouseY);
    return false;

  }

  //translate
  if (mouseIsPressed == true) {
    rotateZ(mouseY / mouseX);
  }
  push();
  rotateX(mouseX * 0.01);
  rotateY(mouseY * 0.01);
  //pass image as texture
  texture(img);
  sphere(280);
  pop();

  //  theta += 0.05;
}
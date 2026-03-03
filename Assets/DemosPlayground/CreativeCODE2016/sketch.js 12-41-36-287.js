 var img;
function setup(){
  createCanvas(710, 400, WEBGL);
  img = loadImage("assets/cat.jpg");
}

function draw(){
  background(0);

  var locY = (mouseY / height - 0.5) * (-2);
  var locX = (mouseX / width - 0.5) * 2;

  ambientLight(100, 80, 80);
  pointLight(200, 200, 200, locX, locY, 0);
 

  
  push();
  rotateX(mouseX);
  rotateY(mouseY);
  normalMaterial();
  torus(80, 20, 64, 64);
  pop();

 translate(mouseX, mouseY);
}
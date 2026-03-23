Tesseract tesseract;
 
void setup(){
  size(1000,1000);
  stroke(255);
  strokeWeight(2);
  //float w12=width/12.,w6=width/6.,h12=height/12.,h24=height/24.;
  int k=0;
  //buttonXY = new Toggle(w12+w6*k++,height-h24,w6,h12,"XY");
  //buttonXZ = new Toggle(w12+w6*k++,height-h24,w6,h12,"XZ");
  //buttonYZ = new Toggle(w12+w6*k++,height-h24,w6,h12,"YZ");
  //buttonXW = new Toggle(w12+w6*k++,height-h24,w6,h12,"XW");
  //buttonYW = new Toggle(w12+w6*k++,height-h24,w6,h12,"YW");
  //buttonZW = new Toggle(w12+w6*k++,height-h24,w6,h12,"ZW");
  tesseract = new Tesseract();
}
 
void draw(){
  background (0);
  pushMatrix();
   
  translate(mouseX, mouseY);
   
  tesseract.display();
  popMatrix();
   
  if (mouseX < 500) tesseract.turn(0,1,.01);
  if (mouseY < 500) tesseract.turn(0,2,.01);
  if (mouseY == 500 ) tesseract.turn(1,2,.01);
  if (mouseX > 500) tesseract.turn(0,3,.01);
  if (mouseY > 500) tesseract.turn(1,3,.01);
  if (mouseX == 500) tesseract.turn(2,3,.01);
}
 
void mousePressed(){

  tesseract = new Tesseract();
}
 
void mouseReleased(){

}
 
class Tesseract{
  float[][][] lines;
  float mouseX, mouseY, z, w, perspZ, perspW, size;
   
  Tesseract(){
    size=width/24;
    z=5;
    w=1;
    perspZ=4;
    perspW=1;
     
    float[][][] temp={
    {{1,1,1,1},{-1, 1, 1, 1}},
    {{1,1,1,1},{ 1,-1, 1, 1}},
    {{1,1,1,1},{ 1, 1,-1, 1}},
    {{1,1,1,1},{ 1, 1, 1,-1}},
     
    {{-1,-1,1,1},{ 1,-1, 1, 1}},
    {{-1,-1,1,1},{-1, 1, 1, 1}},
    {{-1,-1,1,1},{-1,-1,-1, 1}},
    {{-1,-1,1,1},{-1,-1, 1,-1}},
     
    {{-1,1,-1,1},{ 1, 1,-1, 1}},
    {{-1,1,-1,1},{-1,-1,-1, 1}},
    {{-1,1,-1,1},{-1, 1, 1, 1}},
    {{-1,1,-1,1},{-1, 1,-1,-1}},
     
    {{-1,1,1,-1},{ 1, 1, 1,-1}},
    {{-1,1,1,-1},{-1,-1, 1,-1}},
    {{-1,1,1,-1},{-1, 1,-1,-1}},
    {{-1,1,1,-1},{-1, 1, 1, 1}},
     
    {{1,-1,-1,1},{-1,-1,-1, 1}},
    {{1,-1,-1,1},{ 1, 1,-1, 1}},
    {{1,-1,-1,1},{ 1,-1, 1, 1}},
    {{1,-1,-1,1},{ 1,-1,-1,-1}},
     
    {{1,-1,1,-1},{-1,-1, 1,-1}},
    {{1,-1,1,-1},{ 1, 1, 1,-1}},
    {{1,-1,1,-1},{ 1,-1,-1,-1}},
    {{1,-1,1,-1},{ 1,-1, 1, 1}},
     
    {{1,1,-1,-1},{-1, 1,-1,-1}},
    {{1,1,-1,-1},{ 1,-1,-1,-1}},
    {{1,1,-1,-1},{ 1, 1, 1,-1}},
    {{1,1,-1,-1},{ 1, 1,-1, 1}},
     
    {{-1,-1,-1,-1},{ 1,-1,-1,-1}},
    {{-1,-1,-1,-1},{-1, 1,-1,-1}},
    {{-1,-1,-1,-1},{-1,-1, 1,-1}},
    {{-1,-1,-1,-1},{-1,-1,-1, 1}}};
     
    lines=temp;
  }
   
  void turn(int a, int b, float deg){
    float[] temp;
    for (int j=0; j<2; j++)
      for (int i=0; i<32; i++){
        temp=lines[i][j];
        lines[i][j][a]=temp[a]*cos(deg)+temp[b]*sin(deg);
        lines[i][j][b]=temp[b]*cos(deg)-temp[a]*sin(deg);
      }
  }
   
  void persp(float[][][] arr){
    for (int j=0; j<2; j++)
      for (int i=0; i<32; i++){
        arr[i][j][0]=arr[i][j][0]+(arr[i][j][0]+mouseX)*((arr[i][j][2]+z)/perspZ+(arr[i][j][3]+w)/perspW);
        arr[i][j][1]=arr[i][j][1]+(arr[i][j][1]+mouseY)*((arr[i][j][2]+z)/perspZ+(arr[i][j][3]+w)/perspW);
      }
  }
   
  void resize(float[][][] arr){
    for (int i=0; i<32; i++)
      for (int j=0; j<2; j++)
        for (int k=0; k<4; k++)
          arr[i][j][k]*=size;
  }
   
  void display(){
    float[][][] temp = new float[32][2][4];
    for (int i=0; i<32; i++)
      for (int j=0; j<2; j++)
        for (int k=0; k<4; k++)
          temp[i][j][k]=lines[i][j][k];
    persp(temp);
    resize(temp);
    for (int i=0; i<32; i++)
      line(temp[i][0][0],temp[i][0][1],temp[i][1][0],temp[i][1][1]);
  }
}
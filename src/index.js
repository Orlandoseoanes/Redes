const app=require("./app/app")


const port=process.env.PORT || 4200;

app.listen(port,()=>{
    console.log(`server corriendo ${port}`);
});
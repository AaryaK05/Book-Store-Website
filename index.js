// express for server
import express from "express";
//mongoose for database handling
import mongoose from "mongoose";
//body-parser for parsing of data inside body
import bodyParser from "body-parser";
//session maintainance
import session from "express-session";
//passport middleware for using different strategies
import passport from "passport";
//passport local strategy that is implemented
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
//passport google strategy i.e implemented
import { Strategy as LocalStrategy } from "passport-local";
//user find or create method
import findOrCreate from "mongoose-findorcreate";
//dotenv
import dotenv from "dotenv";
dotenv.config();



//await function to connect to local database(mongodb)
await mongoose.connect("mongodb://127.0.0.1/courses");
console.log("connected to database");

/* --------------------------------------------SCHEMA----------------------------------------------------------*/
/* USER SCHEMA */
const userSchema = new mongoose.Schema({
  Username: {
    type: String,
    required: true,
    unique: true,
  },
  Email: {
    type: String,
    required: true,
  },
  Password: {
    type: String,
    minlength: 6,
    required: true,
  },
  Provider:{
    type:String,
    required:true,
  }
});
userSchema.plugin(findOrCreate);
const User = mongoose.model("User", userSchema);

/* BOOKS SCHEMA */
const bookSchema = new mongoose.Schema({
  Book_id: Number,
  Book_Title: String,
  Book_Author: String,
  Book_Summary: String,
  Book_Price: Number,
});
const Book = mongoose.model("book", bookSchema);

/* ORDERS SCHEMA */
const orderSchema = new mongoose.Schema({
  Order_by: String,
  Order_date: Date,
  Order_items: JSON,
  Order_total: Number,
  Order_status: {
    type: String,
    default: "Not processed",
  },
});
const Order = mongoose.model("order", orderSchema);
/* --------------------------------------------SCHEMA----------------------------------------------------------*/

const app = express();
const port = 310;

//To use static files with the parameter as- express.static(root,[options]);
app.use(express.static("public"));
//PARSE THE body in a json format
app.use(bodyParser.json());
//support parsing of application/x-www-form-urlencoded post data
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: false }));

//set view engine(render pages with template files)
app.set("view engine", "ejs");

/* session */
app.use(
  session({
    secret: "Keep this between us.",
    resave: false,
    saveUninitialized: true,
  })
);
/* session */

/* PASSPORT -----------------------------------*/
app.use(passport.initialize());
app.use(passport.session());

//passport implementation of local strategy
passport.use(
  new LocalStrategy(function verify(username, password, done) {
    //Search the user, password in the DB to authenticate the user
    User.findOne({ Username: username }).then(function (foundUser) {
      if (foundUser) {
        console.log("User found");
        if (foundUser.Password == password) {
          const email = foundUser.Email;
          let authenticated_user = { name: username, email: email };
          console.log(authenticated_user);
          return done(null, authenticated_user);
        }
       
          return done(null,false);
        
      }
      return done(null,false);
    });
  })
);

passport.use(
  new GoogleStrategy(
    {
      clientID:process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:310/auth/google/callback",
    },
    function (accessToken, refreshToken, profile, done) {
     
      User.findOrCreate({ Username : profile.displayName,Email:"google-signin",Password:"google-signin",Provider:'Google' }, function (err, user) {
        console.log(user);
        console.log("Goolge:");
        let authenticated_user = { name:profile.displayName, email:"google-signin",provider:user.Provider };
        return done(err,authenticated_user);
      });
    }
  )
);

passport.serializeUser((userObj, done) => {
  done(null, userObj);
});
passport.deserializeUser((userObj, done) => {
  done(null, userObj);
});

app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/Login" }),
  function (req, res) {
    // Successful authentication, redirect home.
    res.redirect("/home");
  }
);

/* PASSPORT -----------------------------------*/

//ROUTING -----------------------------------------------------------------

const checkAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) { 
    return next()
   }
  res.redirect("/login")
}
const checkLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) {
    return res.redirect("/home");
  }
  next();
};

app.get("/Login",checkLoggedIn, (req, res) => {
  res.render("login.ejs");
});

app.post(
  "/Login",
  passport.authenticate("local", {
    successRedirect: "/home",
    failureRedirect: "/Login",
  })
);

app.get("/Signup",checkLoggedIn, (req, res) => {
  res.render("signup.ejs");
});

app.post("/Signup", (req, res) => {
  const usrname = req.body.username;
  const password = req.body.password;
  const email = req.body.email;

  if (password.length < 6) {
    const errormsg = "Password length must be more than 5 characters!";
    res.render("signup.ejs", { errormsg: errormsg });
  } else if (usrname.length < 5 || usrname.length > 15) {
    const errormsg = "Username minlength is 5 and max 15!";
    res.render("signup.ejs", { errormsg: errormsg });
  } else {
    try {
      const newuser = new User({
        Username: req.body.username,
        Email: req.body.email,
        Password: req.body.password,
        Provider:'Local'
      });
      newuser.save();
      res.redirect("/Login");
    } catch (err) {
      res.redirect("/Signup");
      console.log(err);
    }
  }
});

app.get("/home",checkAuthenticated, async (req, res) => {
  const result = await Book.find({});
  if (!req.session.cart) {
    req.session.cart = [];
  }
  const cartitems = req.session.cart.length;
  res.render("home.ejs", { products: result, cartitems: cartitems });
});

app.get("/cart",checkAuthenticated, (req, res) => {
  const cart = req.session.cart;
  let total = 0;

  for (let k = 0; k < req.session.cart.length; k++) {
    total += parseInt(req.session.cart[k].product_price);
    if (req.session.cart[k].quantity > 1) {
      let quantity = req.session.cart[k].quantity;
      while (quantity > 1) {
        total += parseInt(req.session.cart[k].product_price);
        quantity--;
      }
    }
  }
  const cartitems = req.session.cart.length;
  res.render("cart.ejs", {
    cart: cart,
    total: total,
    cartitems: cartitems,
  });
});

app.post("/add_cart", async (req, res, next) => {
  const id = req.body.product_id;
  const title = req.body.product_Title;
  const author = req.body.product_Author;
  const price = req.body.product_Price;

  let count = 0;
  for (let i = 0; i < req.session.cart.length; i++) {
    if (req.session.cart[i].product_id === id) {
      req.session.cart[i].quantity += 1;

      count++;
    }
  }

  if (count == 0) {
    const cart_data = {
      product_id: id,
      product_title: title,
      product_author: author,
      product_price: price,
      quantity: 1,
    };
    req.session.cart.push(cart_data);
  }
  const result = await Book.find({});
  const msg = "Successfully added to cart!";
  const cartitems = req.session.cart.length;
  console.log(cartitems);
  res.render("home.ejs", {
    msg: msg,
    products: result,
    cartitems: cartitems,
  });
});

app.post("/remove-item", (req, res) => {
  const id = req.body.product_id;
  const price = req.body.product_Price;

  for (let i = 0; i < req.session.cart.length; i++) {
    if (id === req.session.cart[i].product_id) {
      req.session.cart.splice(i, 1);
    }
  }
  res.redirect("/cart");
});

app.post("/placeorder", (req, res) => {
  const uname = req.user.name;
  const cart = req.session.cart;
  const order_total = req.body.Order_total;
  const date = new Date();

  const obj = new Order({
    Order_by: uname,
    Order_date: date,
    Order_items: cart,
    Order_total: order_total,
  });

  obj.save();
  req.session.cart = [];

  res.redirect("/profile");
});

app.get("/account",checkAuthenticated, (req, res) => {
  const provider=req.user.provider;
  const uname = req.user.name;
  const emailid = req.user.email;
  console.log(req.user);
  const cartitems = req.session.cart.length;
  res.render("account.ejs", {
    uname: uname,
    email: emailid,
    cartitems: cartitems,
  });
});

app.get("/orders",checkAuthenticated, async (req, res) => {
  const uname = req.user.name;
  const ord = await Order.find({ Order_by: uname });
  const cartitems = req.session.cart.length;
  res.render("orders.ejs", { orders: ord, cartitems: cartitems });
});

app.get("/profile",checkAuthenticated, (req, res) => {
  const cartitems = req.session.cart.length;
  res.render("profile.ejs", { cartitems: cartitems });
});


app.get("/Logout",(req,res)=>{
  req.logout(function(err) {
    if (err) {
       return next(err); 
      }
      res.redirect("/Login")
      console.log(`-------> User Logged out`)
  });
})

app.listen(port, function () {
  console.log("Server started on port" + `${port}`);
});

const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;

// middlewire
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jm3t3oc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// console.log(uri);

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db("talkbridgeDB").collection("users");
    const postCollection = client.db("talkbridgeDB").collection("posts");
    const announcementCollection = client.db("talkbridgeDB").collection("announcements");
    const paymentCollection = client.db("talkbridgeDB").collection("paymentss");
    const commentCollection = client.db("talkbridgeDB").collection("comments");

    // jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    })

    // middlewires
    const verifyToken = (req, res, next) => {
      console.log('inside verify token: ', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
          return res.status(401).send({ message: 'unauthorized access' });
        }
        req.decoded = decoded;
        next();
      })
    }

    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }

    // users relaated api
    // verifyToken, verifyAdmin,
    app.get('/users', async (req, res) => {
      // console.log(req.headers);
      const result = await userCollection.find().toArray();
      res.send(result);
    })

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'User Already exists', insertedId: null })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    })

    app.patch('/users/:email',async(req,res)=>{
      // const email =  req.params.email;
      // console.log(email);
      const userBadge = req.body;
      const updatedDoc = {
        $set: {
          name: userBadge.name,
          email: userBadge.email,
          image: userBadge.image,
          badge: 'gold',
        }
      }
      const result = await userCollection.updateOne({email:req.params.email}, updatedDoc);
      res.send(result);
    })

    // create admin
    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin',
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })
    // delete user
    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })

    // Posts related api
    app.get('/posts', async (req, res) => {
      const page = parseInt(req.query.page);
      const size = parseInt(req.query.size)
      const filter = req.query;
      console.log('pagination query:',page, size,filter);
      const query = {
        tag: {$regex: filter.search, $options: 'i'}
      }
      const result = await postCollection.find(query)
      .skip(page * size)
      .limit(size)
      .toArray();
      res.send(result); 
    })

    // pagination 
    app.get('/postsCount', async(req,res)=>{
      const count = await postCollection.estimatedDocumentCount();
      res.send({count});
    })


    app.post('/posts',async(req,res)=>{
      const post = req.body;
      const result = await postCollection.insertOne(post);
      res.send(result);
    })
    // TODO: verifyToken, verifyAdmin
    app.delete('/specificPosts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await postCollection.deleteOne(query);
      res.send(result);
    })

    // Announcement related api
    app.get('/announcements', async (req, res) => {
      const result = await announcementCollection.find().toArray();
      res.send(result);
    })

    app.get('/announcements/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await announcementCollection.findOne(query);
      res.send(result);
    })

    app.post('/announcements', verifyToken, verifyAdmin, async (req, res) => {
      const announcement = req.body;
      const result = await announcementCollection.insertOne(announcement);
      res.send(result);
    })

    app.patch('/announcements/:id', verifyToken, verifyAdmin, async (req, res) => {
      const announcement = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          title: announcement.title,
          description: announcement.description,
          authorName: announcement.authorName,
          image: announcement.image,
        }
      }
      const result = await announcementCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    app.delete('/announcements/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await announcementCollection.deleteOne(query);
      res.send(result);
    })

    // payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      // console.log(amount, 'error inside the part of life.');

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    app.post('/payments',async(req,res)=>{
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);
      res.send(result);
    })

    // specific user post
    app.get('/specificPosts',async(req,res)=>{
      console.log(req.query.authorEmail);
      let query = {};
      if(req.query?.authorEmail){
        query = {authorEmail: req.query.authorEmail}
      }
      const result = await postCollection.find(query).toArray();
      res.send(result);
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('TalkBridge is running');
});
app.listen(port, () => {
  console.log(`TalkBridge server is running on : ${port}`);
})
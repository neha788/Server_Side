const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
console.log(process.env.STRIPE_SECRET_KEY);


const port = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(bodyParser.json());

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: "Unauthorized Access" });
    }
    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            console.log(err)
            return res.status(403).send({ message: "Forbidden access" });
        }
        console.log("decoded", decoded);
        req.decoded = decoded;
        next();
    });
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.k0jkj.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: ServerApiVersion.v1,
});
const run = async () => {
    try {
        await client.connect();
        console.log("Connected to MongoDB");
        const db = client.db("final");
        const toolsCollection = db.collection("toolsCollection");
        const ordersCollection = db.collection("ordersCollection");
        const userCollection = db.collection("userCollection");
        const reviewsCollection = db.collection("reviewsCollection");
        const adminCollection = db.collection("adminCollection");
        const paymentCollection = db.collection("paymentCollection");

        //Verify Admin Role 
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({
                email: requester,
            });
            if (requesterAccount.role === "admin") {
                next();
            } else {
                res.status(403).send({ message: "Forbidden" });
            }
        };

        //create user
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body
            console.log(user?.photoURL)
            const filter = { email: email }
            const options = { upsert: true }
            const updateDoc = {

                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options)
            const getToken = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' })
            res.send({ result, getToken })
        })

        //API to make Admin 
        app.put("/user/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: "admin" },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        //API to get admin 
        app.get("/admin/:email", async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user?.role === "admin";
            res.send({ admin: isAdmin });
        });


        //Authentication API 
        app.post("/login", async (req, res) => {
            const user = req.body;
            const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: "1d",
            });
            res.send({ accessToken });
        });

        // API to Run Server 
        app.get("/", async (req, res) => {
            res.send("Server is Running");
        });

        //API to get all tools 
        app.get("/tools", async (req, res) => {
            const tools = await toolsCollection.find({}).toArray();
            res.send(tools);
        });


        //API to get tools by id
        app.get('/tools/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: ObjectId(id) }
            const item = await toolsCollection.findOne(query)
            res.send(item)
        })

        //API to get all orders
        app.get("/orders", async (req, res) => {
            const orders = await ordersCollection.find({}).toArray();
            res.send(orders);
        });

        //API to post order
        app.post("/orders", async (req, res) => {
            const order = req.body;
            const result = await ordersCollection.insertOne(order);
            res.send(result);
        })

        //API to update a order 
        app.put("/orders/:id", async (req, res) => {
            const orderId = req.params.id;
            const order = req.body;
            const query = { _id: ObjectId(orderId) };
            const options = { upsert: true };
            const updatedOrder = await ordersCollection.findOneAndUpdate(
                query,
                {
                    $set: order,
                },
                options
            );
            res.send(updatedOrder);
        });

        //Update a tool
        app.patch("/tools/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const email = req.headers.email;
            if (decodedEmail) {
                const id = req.params.id
                const newTools = req.body
                //  console.log(newTools)
                const query = { _id: ObjectId(id) }
                const product = await toolsCollection.findOne(query)
                //  console.log(product,'prd');
                const options = { upsert: true };
                const updateDoc = {
                    $set: newTools
                }
                const result = await toolsCollection.updateOne(query, updateDoc, options)
                res.send(result);
            } else {
                res.send("Unauthorized access");
            }
        });

        //API to update a user
        app.put("/user/:email", async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            console.log("user", user);
            const query = {
                email: email
            };
            const options = {
                upsert: true,
            };
            const updatedDoc = {
                $set: {
                    displayName: user?.displayName,
                    photoURL: user?.photoURL,
                    number: user?.number,
                    address: user?.address,
                    institute: user?.institute
                },
            };
            const result = await userCollection.updateOne(
                query,
                updatedDoc,
                options
            );
            res.send(result);
        });

        //API to delete a order ADMIN
        app.delete("/order/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const id = req.params.id;
            const email = req.headers.email;
            if (decodedEmail) {

                const result = await ordersCollection.deleteOne({ _id: ObjectId(id) });
                res.send(result);
            } else {
                res.send("Unauthorized access");
            }
        });

        //API to delete a tool ADMIN
        app.delete("/tools/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const id = req.params.id;
            const email = req.headers.email;
            if (decodedEmail) {

                const result = await toolsCollection.deleteOne({ _id: ObjectId(id) });
                res.send(result);
            } else {
                res.send("Unauthorized access");
            }
        });

        //API to delete order USER
        app.delete("/orders/:id", verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const id = req.params.id;
            const email = req.headers.email;
            if (decodedEmail) {

                const result = await ordersCollection.deleteOne({ _id: ObjectId(id) });
                res.send(result);
            } else {
                res.send("Unauthorized access");
            }
        });

        //API to get order by email
        app.get('/orders/:email', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email
            const email = req.params.email
            if (email === decodedEmail) {
                const query = { email: email }
                const cursor = ordersCollection.find(query)
                const items = await cursor.toArray()
                res.send(items)
            }
            else {
                return res.status(403).send({ message: 'forbidden access' })
            }
        })

        //API to get user by user email
        app.get('/user/:email', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const email = req.params.email;
            // console.log("email", email);
            if (email === decodedEmail) {
                const query = { email: email }
                const cursor = userCollection.find(query)
                const items = await cursor.toArray()
                res.send(items)
            }
            else {
                console.log('param');
                return res.status(403).send({ message: 'forbidden access' })

            }
        })

        //API to manage order
        app.get("/orders", async (req, res) => {
            const orders = await ordersCollection.find({}).toArray();
            res.send(orders);
        });

        //API to get all reviews 
        app.get("/reviews", async (req, res) => {
            const reviews = await reviewsCollection.find({}).toArray();
            res.send(reviews);
        });
        //API to post a review 
        app.post('/reviews', async (req, res) => {
            const newReview = req.body;
            console.log(newReview);
            const result = await reviewsCollection.insertOne(newReview);
            res.send(result)
        })
        //API to post a product 
        app.post("/product", verifyJWT, verifyAdmin, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const email = req.headers.email;
            if (email === decodedEmail) {
                const product = req.body;
                await toolsCollection.insertOne(product);
                res.send(product);
            } else {
                res.send("Unauthorized access");
            }
        });

        //products add
        app.post('/tools', verifyJWT, verifyAdmin, async (req, res) => {
            const parts = req.body
            const result = await toolsCollection.insertOne(parts)
            res.send(result)
        })


        //API to get all user
        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray()
            res.send(users)
        })

        //put API to update an user
        app.put("/user/:id", verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            // const email = req.headers.email;
            if (decodedEmail) {
                const id = req.params.id;
                const user = req.body;
                const options = { upsert: true };
                await userCollection.updateOne(
                    { _id: ObjectId(id) },
                    {
                        $set: {
                            user
                        }
                    },
                    options
                );
                res.send(user);
            } else {
                res.send("Unauthorized access");
            }
        })



        app.put('/tools/:id', async (req, res) => {
            const id = req.params.id
            const updateProduct = req.body
            // console.log(updateProduct);
            const query = { _id: ObjectId(id) }
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    availableQuantity: updateProduct.newQuantity
                }
            }

            const result = await toolsCollection.updateOne(query, updateDoc, options)
            res.send(result)
        })



    } finally {
        // client.close(); 
    }
};

run().catch(console.dir);

app.listen(port, () => console.log(`Listening on port ${port}`));
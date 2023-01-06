const functions = require('firebase-functions');
const admin = require('firebase-admin');
var serviceAccount = require("./Inviso-admin-key.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://inviso-26ee5.firebaseio.com"
 });

 var bucket = admin.storage().bucket('inviso-26ee5.appspot.com');

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
exports.deleteFiles = functions.database.ref().onDelete((snapshot, context) => {
    // figure out if a whole file has been deleted, check parent
    // if it has, delete the whole file in storage
    let roomCode = Object.keys(snapshot.val())[0];
    console.log(roomCode);
    let file = bucket.file(`${roomCode}/`)
    bucket.deleteFiles({
        prefix: roomCode + `/soundObjects/*`
    }, function(err){
        if(err){
            console.log(err);
            console.log('Failed to delete soundObjects from storage :(');
        }
        else {
            console.log("successfully deleted soundObjects from storage!");
        }
    });

    bucket.deleteFiles().then(() => {
        let innerBucket = bucket;
        innerBucket.deleteFiles({
            prefix: roomCode + `/zones/*`
        }, function(err){
            if(err){
                console.log(err);
                console.log('Failed to delete zones from storage :(');
            }
            else {
                console.log("successfully deleted zones from storage!");
            }
        });
        innerBucket.deleteFiles().then(() => {
            file.delete().then(() => {
                console.log("successfully deleted room from storage!");
                return true;
            }).catch(err => {
                console.log(err);
                console.log('Failed to delete room files from storage :(');
            });
        })
    })

    return false;
});


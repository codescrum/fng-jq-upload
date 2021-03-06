'use strict';

var Gridform = require('gridform');
var Grid = Gridform.gridfsStream;

var ims = require('imagemagick-stream');
var gridstream = require('gridfs-stream');

var FileUploader = function (dataform, processArgFunc, options) {

  function modelGridForm(model) {
    var gridForm;
    var resource = dataform.getResource(model);
    if (resource) {
      gridForm = Gridform({db: resource.model.db.db, mongo: dataform.mongoose.mongo});
      gridForm.root = resource.model.collection.name;
      }
    return gridForm;
  }

  this.options = options;

  dataform.app.post('/file/upload/:model', function (req, res) {
    var model = req.params.model;
    modelGridForm(model).parse(req, function (err, fields, files) {
      if (err) {
        res.send(500);
      } else {
        var myFile = files.files;
        var id = myFile.id.toString();

        // Options for creating the thumbnail
        var options = {
          mode: 'w', content_type: myFile.type,
          filename: 'thumbnail_' + myFile.path,
          root: myFile.root,
          metadata: { original_id: id } // original id is needed to remove thumbnail afterwards
        };

        var mongo = dataform.mongoose.mongo;
        var resize = ims().resize('100x100').quality(90);
        var resource = dataform.getResource(model);
        var gfs = Grid(resource.model.db.db, mongo);

        var BSON = mongo.BSONPure;
        var o_id = new BSON.ObjectID(myFile.id);

        var readstream = gfs.createReadStream({_id: id, root: myFile.root, fsync: true});
        var writestream = gfs.createWriteStream(options);

        // Use 'close' because of stream spec v1.0 (not finish)
        writestream.on('close', function(file){
          res.send({files:[{
            name: myFile.name,
            size: myFile.size,
            url: '/file/' + model + '/' + id,
            thumbnailUrl: '/file/' + model + '/thumbnail/' + file._id,
            deleteUrl: '/file/' + model + '/' + id,
            deleteType: "DELETE"
          }]});
        });

        // Apply resize transformation as it passes through
        readstream.pipe(resize).pipe(writestream);

      }
    });
  });

  dataform.app.get('/file/:model/:id', function (req, res) {
    try {
      var mongo = dataform.mongoose.mongo;
      var model = req.params.model;
      var resource = dataform.getResource(model);
      var gfs = Grid(resource.model.db.db, mongo);
      var readstream = gfs.createReadStream({_id: req.params.id, root:resource.model.collection.name});
      readstream.pipe(res);
    } catch (e) {
      console.log(e.message);
      res.send(400);
    }
  });

  // Thumbnails endpoint
  dataform.app.get('/file/:model/thumbnail/:id', function (req, res) {
    try {
      var mongo = dataform.mongoose.mongo;
      var model = req.params.model;
      var resource = dataform.getResource(model);
      var gfs = Grid(resource.model.db.db, mongo);
      var readstream = gfs.createReadStream({_id: req.params.id, root:resource.model.collection.name});
      readstream.pipe(res);
    } catch (e) {
      console.log(e.message);
      res.send(400);
    }
  });

  dataform.app.delete('/file/:model/:id', function (req, res) {
    var mongo = dataform.mongoose.mongo;
    var model = req.params.model;
    var resource = dataform.getResource(model);
    var rootName = resource.model.collection.name;
    var gfs = Grid(resource.model.db.db, mongo);

    // Find the thumbnail image based on the original_id stored in the metadata
    // for the original file and remove it
    var collection = dataform.mongoose.connection.collection(resource.model.collection.name+'.files');
    collection.findOne({ 'metadata.original_id': req.params.id }, { }, function (err, obj) {
      if (err) return;
      gfs.remove({_id: obj._id, root: rootName}, function(err){
        if (err) return false;
        return true;
      })
    });

    // remove the original file too
    gfs.remove({_id: req.params.id, root: rootName}, function(err) {
      if (err) {
        res.send(500);
      } else {
        res.send(200);
      }
    });

  });

};

module.exports = exports = FileUploader;




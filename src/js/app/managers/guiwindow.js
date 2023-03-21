import Helpers from '../../utils/helpers';
import Action from '../model/action';
import Config from '../../data/config';
import SoundObject from '../components/soundobject';

export default class GUIWindow {
  constructor(main) {
	this.id = null;        // uuid of displayed "shape" or "containerObject"
	this.obj = null;       // the object whose information is being displayed
	this.stoRef = main.stoRef;
	this.dbRef = main.dbRef;
	this.roomCode = main.roomCode;
	this.headKey = null;
	this.listeners = [];

	this.undoableActionStack = main.undoableActionStack;

	this.app = main;
	this.container = document.getElementById('guis');
	this.isDisabled = false;
	this.display();

	// add listeners for dragging parameters
	document.addEventListener('mousemove', this.drag.bind(this));
	document.addEventListener('mouseup', this.stopDragging.bind(this));
	this.dragEvent = {};

	this.typeEvent = {};
	this.clickEvent = {};
  }

  updateFirebaseDetails(dbRef, stoRef, headKey, roomCode){
	this.headKey = headKey;
	this.stoRef = stoRef;
	this.dbRef = dbRef;
	this.roomCode = roomCode;
  }

  // ------- showing/hiding the overall gui ---------- //

  display(obj) {
	if (obj) {
		this.show(obj);
	}
	else {
		this.hide();
		this.id = this.obj = null;
	}
  }

  // disable/enable pointer events
  disable() {
	this.isDisabled = true;
  }
  enable() {
	this.isDisabled = false;
  }

  // clear gui and listeners
  clear() {
	this.container.innerHTML = '';
	this.listeners = [];
  }

  // show gui
  show(obj) {
	if (!obj) { return; }

	// get details of object
	if (obj.type == 'SoundObject'|| (obj.type == 'SoundTrajectory' && obj.parentSoundObject.type == 'SoundObject')) {
	  if (obj.type == 'SoundTrajectory') {
		obj = obj.parentSoundObject;
	  }
	  if (this.id !== obj.containerObject.uuid) {
		  // init a new gui
		  this.clear();
		  this.id = obj.containerObject.uuid;
		  this.obj = obj;
		  this.initObjectGUI(obj);
	  }
	  else {
		  // read and update object parameters
		  this.updateObjectGUI(obj);
	  }
	} else if (obj.type == 'SoundZone') {
	  if (this.id !== obj.shape.uuid) {
		  // init a new gui
		  this.clear();
		  this.id = obj.shape.uuid;
		  this.obj = obj;
		  this.initSoundzoneGUI(obj);
	  }
	  else {
		  // read and update object parameters
		  this.updateSoundzoneGUI(obj);
	  }
	} else if (obj.type == 'HeadObject' || (obj.type == 'SoundTrajectory' && obj.parentSoundObject.type == 'HeadObject')) {
	  if (obj.type == 'SoundTrajectory') {
		obj = obj.parentSoundObject;
	  }
	  if (obj.containerObject.position && obj.rotation) {
		if (this.id !== obj.uuid) {
		  // init a new gui
		  this.clear();
		  this.id = obj.uuid;
		  this.obj = obj;
		  this.initHeadGUI(obj);
		}
		else {
		  // read and update object parameters
		  this.updateHeadGUI(obj);
		}
	  }
	} else {
	  console.log('cannot show ui for type',obj.type);
	}
	this.container.style.opacity = 1;
	this.container.style.pointerEvents = this.isDisabled ? 'none' : 'auto';
  }

  // hide gui
  hide() {
	  this.container.style.opacity = 0;
	  this.container.style.pointerEvents = 'none';
	  this.clear();
  }

  //----------- initiating objects --------- //

  // add navigation arrows
  addNav(e, elem) {
	var arrow = document.createElement('div');
	arrow.className = 'nav nav-' + e.direction + ' nav-' + e.type;

	let glyph = e.direction === 'left' ? '‹' : '›';

	arrow.appendChild(document.createTextNode(glyph));
	elem.appendChild(arrow);
	arrow.onclick = this.nav.bind(this, e);
  }

  // set up initial parameters for a sound object
  initObjectGUI(object) {
	  var mesh = object.containerObject;
	  var elem = this.addElem('OBJECT ' + (this.app.soundObjects.indexOf(object) + 1), true);
	  elem.style.fontWeight = 'bold';
	  let tempDb = this.dbRef;
	  let headKey = this.headKey;
	  let roomCode = this.roomCode;
	  function setObjectPosition(component,dx) {
		let destination = mesh.position.clone();
		destination[component] += dx;

		// clamp y to [-300,300]
		destination.y = Math.min(Math.max(-300,destination.y), 300);

		// move all child objects of the object
		object.setPosition(destination);

		if (object.trajectory) {
		  // move trajectory
		  if (component === 'y') {
			object.trajectory.splinePoints.forEach((pt) => {
			  pt[component] = Math.min(Math.max(-300, pt[component] + dx), 300);
			});
			object.trajectory.updateTrajectory();
		  }
		  else {
			object.trajectory.objects.forEach((obj) => {
			  obj.position[component] += dx;
			})
			object.trajectory.splinePoints.forEach((pt) => {
			  pt[component] += dx;
			});
		  }
		}
		if(roomCode != null){
		  tempDb.child('objects').child(object.containerObject.name).update({
			position: destination,
			lastEdit: headKey
		  });
		}
	  }

	  function changeAudioTime(dx) {
		if (object.omniSphere.sound && object.omniSphere.sound.state) {
		  if (!object.omniSphere.sound.state.isAudioPaused) {
			object.stopSound();
		  }
		  object.omniSphere.sound.state.isChangingAudioTime = true;

		  // Value sound be between 0 and duration of audio
		  const max = object.omniSphere.sound.state.duration;
		  const time = Math.max(Math.min(Math.floor(object.omniSphere.sound.state.currentTime + dx), max), 0);

		  // Set current time and update paused at time
		  object.omniSphere.sound.state.currentTime = time;
		  object.omniSphere.sound.state.pausedAt = time * 1000;

		  // Play/pause depending on global play/pause status
		  if (object.userSetPlay) {
			object.playSound();
		  }
		}
	  }

	  function audioPlayPause() {
		if (object.omniSphere.sound && object.omniSphere.sound.state) {
		  if (object.omniSphere.sound.state.isAudioPaused) {
			object.playSound(true);
			object.userSetPlay = true;
		  }
		  else {
			object.stopSound(true);
			object.userSetPlay = false;
		  }
		}
	  }

	  function changeVolume(dx) {
		if (object.omniSphere.sound && object.omniSphere.sound.volume) {
		  // clamp value to (0.05, 2)
		  const vol = Math.max(Math.min(object.omniSphere.sound.volume.gain.value + dx/50, 2), 0.05);
		  object.omniSphere.sound.volume.gain.value = vol;
		  object.changeRadius(true);
          if(roomCode != null && object.isAddingSound){
            object.objCache.volume = vol;
          }
		}
	  }

	  this.addParameter({
		  property: 'File',
		  value: object.omniSphere.sound ? object.omniSphere.sound.name.split('/').pop() : 'None',
		  type: 'file-input',
		  display: object.omniSphere.sound,
		  events: [{ type: 'click', callback: this.addSound.bind(this) }]
	  },elem).id = "omnisphere-sound-loader";

	  this.addParameter({
		  property: 'Time',
		  value: object.omniSphere.sound ? this.convertTime(object.omniSphere.sound.state.currentTime) : '0:00',
		  type: 'time',
		  cls: 'time',
		  bind: changeAudioTime,
		  bindAdditional: audioPlayPause
	  }, elem);

	  this.addParameter({
		  property: 'Volume',
		  value: object.omniSphere.sound && object.omniSphere.sound.volume ? object.omniSphere.sound.volume.gain.value : 'N/A',
		  type: 'number',
		  cls: 'volume',
		  bind: changeVolume
	  },elem);

	  /* global object parameters */
	  var gElem = document.createElement('div');
	  gElem.id = "object-globals";
	  elem.appendChild(gElem);
	  gElem.style.display = this.app.isEditingObject ? 'none' : 'block';

	  this.addParameter({
		  property: 'Position X',
		  value: Number(mesh.position.x.toFixed(2)),
		  type: 'number',
		  cls: 'x',
		  bind: setObjectPosition.bind(this, "x")
	  },gElem);

	  this.addParameter({
		  property: 'Position Y',
		  value: Number(mesh.position.z.toFixed(2)),
		  type: 'number',
		  cls: 'z',
		  bind: setObjectPosition.bind(this, "z")
	  },gElem);

	  this.addParameter({
		  property: 'Altitude',
		  value: Number(mesh.position.y.toFixed(2)),
		  type: 'number',
		  cls: 'y',
		  bind: setObjectPosition.bind(this, "y")
	  },gElem);

	  let guiHeight = 0;
	  // insert cone window
	  object.cones.forEach((cone) => {
		let elem = this.addCone(cone);
		guiHeight += elem.scrollHeight;
	  });

	  // "add cone" dialog
	  var addConeElem = this.addParameter({
		value: 'ADD CONE',
		button: true,
        hasCones: object.cones.length > 0,
        hasTrajectory: object.trajectory != null,
		events: [{
		  type: 'click',
		  callback: this.addSound.bind(this)
		}]
	  });
	  addConeElem.id = 'add-cone';
      
	  if (object.trajectory) {
		let elem = this.addTrajectory(object);
	  }
	  else {
		let elem = this.addTrajectoryDialog();
	  }

	this.addNav({type: "object", direction: "left"}, elem);
	this.addNav({type: "object", direction: "right"}, elem);
	guiHeight = elem.scrollHeight + 35;

	if (object.cones.length > 0){
        // addButton is initialized in addCone
		addConeElem.style.zIndex = "20";
		addConeElem.style.position = "absolute";
        addConeElem.classList.add('add-cone-object-view');
		addConeElem.firstChild.style.padding = '1.5% 8px';
        if (this.app.isEditingObject) {
            addConeElem.style.top = "167.5px";
        } else {
            addConeElem.style.top = "228.51px";
        }
	}

}

  // "add trajectory" dialog
addTrajectoryDialog() {
	var addTrajectoryElem = this.addParameter({
	  value: 'ADD TRAJECTORY',
	  button: true,
	  events: [{
		type: 'click',
		callback: this.app.toggleAddTrajectory.bind(this.app, true)
	  }]
	});
	addTrajectoryElem.id = 'add-trajectory'
	return addTrajectoryElem;
}

  // set up initial parameters for a sound object cone
addCone(cone, isVisible = true) {
		// move add cone button over cone window
		let addButton = document.getElementById('add-cone');
		if (addButton){
			addButton.style.zIndex = "20";
			addButton.style.position = "absolute";
			// addButton.style.left = "26.5%";
					
		}

		// called every single time the object is clicked
		var elem = this.addElem('', false, document.getElementById('add-cone'));
		elem.id = 'cone-' + cone.id;
		elem.className = 'cone';
			if (!isVisible) {
					elem.style.display = 'none';
			}

		// set bg color
			//let hoverColor = cone.hoverColor();
			
		let color = cone.hoverColor();//();
			//color.getHSL(cone.hoverColor());
			console.log("get HSL: ", cone.hoverColor());

		var cr = Math.min(color.r*270, 255);
		var cg = Math.min(color.g*270, 255);
		var cb = Math.min(color.b*270, 255);//Math.max(color.l*100, 70);
		elem.style.backgroundColor = 'rgb('+cr+', '+cg+', '+cb+')';//'hsl('+color.h+','+color.s+'%,'+color.l+'%)';

		
		var object = this.obj;
		let headKey = this.headKey;
		let roomCode = this.roomCode;

		function changeAudioTime(dx) {
			if (cone.sound && cone.sound.state) {
			if (!cone.sound.state.isAudioPaused) {
				object.stopConeSound(cone);
			}
			cone.sound.state.isChangingAudioTime = true;

			// Value sound be between 0 and duration of audio
			const max = cone.sound.state.duration;
			const time = Math.max(Math.min(Math.floor(cone.sound.state.currentTime + dx), max), 0)

			// Set current time and update paused at time
			cone.sound.state.currentTime = time;
			cone.sound.state.pausedAt = time * 1000;

			// Play/pause depending on global play/pause status
			if (cone.userSetPlay) {
				object.playConeSound(cone);
			}
			}
		}

		function audioPlayPause() {
			if (cone.sound && cone.sound.state) {
			if (cone.sound.state.isAudioPaused) {
				object.playConeSound(cone, true);
				cone.userSetPlay = true;
			}
			else {
				object.stopConeSound(cone, true);
				cone.userSetPlay = false;
			}
			}
		}

		function changeVolume(dx) {
			if (cone.sound && cone.sound.volume) {

			// clamp value to (0.05, 2)
			const volume = Math.max(Math.min(cone.sound.volume.gain.value + dx/50, 2), 0.05);

			if (volume !== cone.sound.volume.gain.value) {
				// modify cone length
				cone.sound.volume.gain.value = volume;
				object.changeLength(cone);
				if(roomCode != null){
				if(object.finishUploadingSound){
					let updates = {
						volume: volume,
						lastEdit: headKey
					}
					object.dbRef.child('objects').child(object.containerObject.name).child('cones').child(cone.uuid).update(updates);
				}
				}
			}
			}
		}

		function changeSpread(dx) {
			if (cone.sound && cone.sound.spread) {
			// clamp value to (0.05,1)
			const spread = Math.max(Math.min(cone.sound.spread + dx/100, 1), 0.05);

			if (spread !== cone.sound.spread) {
				// modify cone width
				cone.sound.spread = spread;
				object.changeWidth(cone);
			}
			if(roomCode != null){
				if(object.finishUploadingSound){
					let updates = {
						spread: spread,
						lastEdit: headKey
					}
					object.dbRef.child('objects').child(object.containerObject.name).child('cones').child(cone.uuid).update(updates);
				}
			}
			}
		}

		function setConeRotation(component, dx) {
			// clamp lat/long values
			var lat = cone.lat || 0.0001;
			var long = cone.long || 0.0001;

			if (component === "lat") {
			if (long > 0) {
				lat -= dx * Math.PI / 180;
			}
			else {
				lat += dx * Math.PI / 180;
			}
			if (lat > Math.PI) {
				lat = Math.PI - lat;
				long = -long;
			}
			else if (lat < -Math.PI) {
				lat = Math.PI - lat;
				long = -long;
			}
			}
			else {
			long += dx * Math.PI / 180;
			if (long > Math.PI *2) {
				long -= Math.PI * 2;
			}
			else if (long < -Math.PI * 2) {
				long += Math.PI * 2;
			}
			}

			object.pointConeMagic(cone, lat, long);
			if(roomCode != null){
			if(object.finishUploadingSound){
				let updates = {
					latitude: lat,
					longitude: long,
					lastEdit: headKey
				}
				object.dbRef.child('objects').child(object.containerObject.name).child('cones').child(cone.uuid).update(updates);
			}
			}
		}

		let deleteCone = this.addParameter({
			value: 'Delete',
			button: true,
			events:[{
				type:'click',
				callback: function() {
				if(this.roomCode != null){
					object.dbRef.child('objects').child(object.containerObject.name).child('cones').child(cone.uuid).update({
					sound: null,
					lastEdit: headKey
					});
				}
				this.app.undoableActionStack.push(new Action(this.app.activeObject, 'removeCone'));
				this.app.undoableActionStack[this.app.undoableActionStack.length - 1].secondary = this.app.interactiveCone;
				this.app.removeCone(this.obj, cone);
				if (this.app.interactiveCone == null){
					let addButton = document.getElementById("add-cone");
					addButton.style.position = 'relative';
					addButton.style.removeProperty('top');
					addButton.firstChild.style.removeProperty('padding');
									addButton.classList.remove('add-cone-object-view')
				}
				}.bind(this)
			}]
			}, elem);
		deleteCone.id = 'delete-cone';

		this.addParameter({
			property: 'File',
			value: cone.filename,
			innercls: 'cone',
			events: [{
			type: 'click',
			callback: this.addSound.bind(this)
			}],
		}, elem);
		this.addParameter({
			property: 'Time',
			value: this.convertTime(cone.sound.state.currentTime),
			type: 'time',
			cls: 'time',
			bind: changeAudioTime,
			bindAdditional: audioPlayPause
		}, elem);
		this.addParameter({
			property: 'Volume',
			value: Number((cone.sound.volume.gain.value).toFixed(3)),
			type: 'number',
			cls: 'volume',
			// suffix: ' dB',
			bind: changeVolume
		}, elem);
		this.addParameter({
			property: 'Spread',
			value: Number((cone.sound.spread).toFixed(3)),
			type: 'number',
			cls: 'spread',
			bind: changeSpread
		}, elem);
		this.addParameter({
			property: 'Longitude',
			value: Math.round(cone.long * 180/Math.PI),
			type: 'number',
			cls: 'long',
			suffix: '˚',
			bind: setConeRotation.bind(this, "long")
		}, elem);
		this.addParameter({
			property: 'Latitude',
			value: Math.round(cone.lat * 180/Math.PI),
			type: 'number',
			cls: 'lat',
			suffix: '˚',
			bind: setConeRotation.bind(this, "lat")
		}, elem);

		/* Cone navigation */
		this.addNav({type: "cone", direction: "left"}, elem);
		this.addNav({type: "cone", direction: "right"}, elem);
		//let baseParams = document.getElementsByClassName('baseParam');
		let baseParams = elem;
		let guiHeight = document.getElementById('guis');
		// baseParams.length > 0
		if(guiHeight){
			guiHeight = guiHeight.scrollHeight + 5;
			baseParams = guiHeight - (elem.scrollHeight + 5) - 25;
			//baseParams = baseParams[0].scrollHeight;

			if(addButton && !addButton.classList.contains('add-cone-object-view')) {
							addButton.classList.add('add-cone-object-view');
							addButton.firstChild.style.padding = '1.5% 8px';
			}
		}
		// let button = document.querySelectorAll("#delete-cone > span");
		let deleteCones = document.querySelectorAll("#delete-cone");
		let button = deleteCones[deleteCones.length - 1].firstChild;
		button.style.fontWeight = "normal";
		button.style.backgroundColor = "#f0f0f0"
		button.style.color = "#5d5e5d";
		button.style.borderRadius = "6px";
		deleteCones[deleteCones.length - 1].style.padding = "0%";
		return elem;
}

  // remove cone parameter window
  removeCone(cone) {
	const cones = this.container.getElementsByClassName('cone');
	for (let i = 0; i < cones.length; ++i) {
	  if (cones[i].id.split('-').pop() == cone.id) {
		cones[i].parentNode.removeChild(cones[i]);
		return;
	  }
	}
  }

  // set up initial parameters for a sound object trajectory path
  addTrajectory(object) {
	var elem = this.addElem('TRAJECTORY');
	elem.id = 'trajectory';
    let dbRef = this.dbRef;

    function changePositionOnTrajectory(dx) {
        if (object.trajectory) {
          const position = Math.max(Math.min((object.trajectoryClock + dx/100), 1), 0);
          object.trajectoryClock = position;
          // temporarily set speed to 0 while changing and restore back afterwards
          if (object.roomCode) {
            object.dbRef.child('objects').child(object.containerObject.name).update({
                trajectoryPosition: position
            });
          }
          if (object.movementSpeed != 0) {
            object.oldTrajectorySpeed = object.movementSpeed;
            object.movementSpeed = 0;
            object.calculateMovementSpeed();
            object.updateSpeed(object.movementSpeed);
          }
        }
    }

	let deleteTrajectory = this.addParameter({
		value: 'Delete',
		button: true,
		events:[{
		  type:'click',
		  callback: function() {
			this.app.removeSoundTrajectory(object.trajectory, "gui");
			var trajectory = Object.assign(object.trajectory, trajectory);
			this.app.undoableActionStack.push(new Action(trajectory, 'removeSoundTrajectory'));
			object.trajectory = null;
			if(this.roomCode != null){
			  if(object.type == 'SoundObject'){
				this.dbRef.child('objects').child(object.containerObject.name).update({
				  position: object.containerObject.position,
				  trajectory: null,
				  lastEdit: this.headKey
				});
			  } else {
				this.dbRef.child('users').child(this.headKey).update({
				  position: object.containerObject.position,
				  trajectory: null
				});
			  }
			}
			object.trajectoryClock = Config.soundObject.defaultMovementSpeed;
			elem.parentNode.removeChild(elem);
			let guiHeight = document.getElementById('guis').scrollHeight;
			let baseParams = document.getElementsByClassName('baseParam')[0].scrollHeight;
			let addButton = document.getElementById('add-cone');
            if(object.type == 'SoundObject' && addButton.style.position == "absolute"){
                let addButton = document.getElementById('add-cone');
                if (addButton.style.position == "absolute") {
                    if (this.app.isEditingObject) {
                        addButton.style.top = "167.5px";
                    } else {
                        addButton.style.top = "228.51px";
                    }
                }
            }
			this.addTrajectoryDialog();
		  }.bind(this)
		}]
	}, elem);
	deleteTrajectory.id = 'delete-trajectory';
	let button = document.querySelector("#delete-trajectory > span");
	button.style.fontWeight = "normal";
	button.style.backgroundColor = "#f0f0f0"
	button.style.color = "#5d5e5d";
	button.style.borderRadius = "6px";
	button.style.margin = '0 36% 4% 36%';
	document.getElementById('delete-trajectory').style.padding = "0%";


	this.addParameter({
	  property: 'Speed',
	  value: object.movementSpeed,
	  // suffix:' m/s',
	  type:'number',
	  cls:'speed',
	  bind: function(dx) {
		const rawSpeed = object.movementSpeed + dx/10;
		object.movementSpeed = Math.min(Math.max(-100, rawSpeed), 100);
		object.calculateMovementSpeed();
		object.updateSpeed(rawSpeed)
	  }
	}, elem);

    this.addParameter({
        property: 'Position',
        value: object.trajectoryClock,
        type: 'number',
        cls: 'position',
        bind: changePositionOnTrajectory,
        events: [{type: 'mouseup', callback: this.restoreMovementSpeed.bind(this, object)},
        {type: 'click', callback: this.restoreMovementSpeed.bind(this, object)}]
    }, elem);

	return elem;
  }

  restoreMovementSpeed(object) {
    if (object.trajectory &&  object.oldTrajectorySpeed) {
        object.movementSpeed = object.oldTrajectorySpeed;
        object.calculateMovementSpeed();
        object.updateSpeed(object.movementSpeed);
        object.oldTrajectorySpeed = null;
    }
   }  // end of restoreMovementSpeed

  disableGlobalParameters() {
	const global = document.getElementById('object-globals');
	if (global) {
	  global.style.display = 'none';
	}
  }
  enableGlobalParameters() {
	const global = document.getElementById('object-globals');
	if (global) {
	  global.style.display = 'block';
	}
  }

  // set up initial parameters for a soundzone
  initSoundzoneGUI(zone) {
	  let tempDb = this.dbRef;
	  let headKey = this.headKey;
	  var elem = this.addElem('Zone ' + (this.app.soundZones.indexOf(zone)+1), false);
	  let roomCode = this.roomCode;


	  function setZonePosition(component, dx) {
		zone.containerObject.position[component] += dx;
		if(roomCode != null){
		  tempDb.child('zones').child(zone.containerObject.name).update({
			position: zone.containerObject.position,
			lastEdit: headKey
		  });
		}
	  }

	  function setZoneRotation(dx) {
		let rotation = zone.containerObject.rotation.y + dx * Math.PI / 180;

		if (rotation < Math.PI) { rotation += Math.PI*2 }
		if (rotation > Math.PI) { rotation -= Math.PI*2 }
		zone.containerObject.rotation.y = rotation;
		if(roomCode != null){
            if(!zone.isAddingSound){
                tempDb.child('zones').child(zone.containerObject.name).update({
                    rotation: rotation,
                    lastEdit: headKey
                });
            }
		}
	  }

	  function changeAudioTime(dx) {
		if (zone.sound && zone.sound.state) {
		  zone.stopSound();
		  zone.isChangingAudioTime = true;

		  // Value sound be between 0 and duration of audio
		  const max = zone.sound.state.duration;
		  const time = Math.max(Math.min(Math.floor(zone.sound.state.currentTime + dx), max), 0)

		  // Set current time and update paused at time
		  zone.sound.state.currentTime = time;
		  zone.sound.state.pausedAt = time * 1000;

		  // Play/pause depending on global play/pause status
		  if (zone.userSetPlay) {
			zone.playSound();
		  }

		}
	  }

	  function audioPlayPause() {
		if (zone.sound && zone.sound.state) {
		  if (zone.sound.state.isAudioPaused) {
			zone.playSound(true);
			zone.userSetPlay = true;
		  }
		  else {
			zone.stopSound(true);
			zone.userSetPlay = false;
		  }
		}
	  }

	  function changeVolume(dx) {
		if (zone.sound) {
		  const volume = Math.max(Math.min(zone.sound.source.volume.gain.value + dx/50, 2), 0.0);
		  zone.shape.material.opacity = Helpers.mapRange(volume, 0, 2, 0.05, 0.35);
		  zone.volume = volume;
		  zone.sound.source.volume.gain.value = volume;
		  if(roomCode != null){
            if(!zone.isAddingSound){
                tempDb.child('zones').child(zone.containerObject.name).update({
                volume: volume,
                lastEdit: headKey
                });
            }
		  }
		}
	  }

	  function changeScale(dx) {
		const prevScale = zone.zoneScale;
		const scale = Math.max(Math.min(zone.zoneScale + dx/50, 2), 0.5);
		zone.zoneScale = Number(scale.toFixed(2));
		zone.updateZoneScale(prevScale);
		if(roomCode != null){
            if(!zone.isAddingSound){
            tempDb.child('zones').child(zone.containerObject.name).update({
                scale: zone.zoneScale,
                prev: prevScale,
                lastEdit: headKey
            });
            } else {
                zone.cache.prev = prevScale;
            }
		}
	  }

	  var pos = zone.containerObject.position;
	  this.addParameter({
		  property: 'File',
		  value: zone.sound ? zone.sound.name.split('/').pop() : 'None',
		  type: 'file-input',
		  display: zone.sound,
		  events: [{ type: 'click', callback: this.addSound.bind(this) }]
	  },elem).id = "zone-sound";

	  this.addParameter({
		property: 'Time',
		value: zone.sound ? this.convertTime(zone.sound.state.currentTime) : '0:00',
		type: 'time',
		cls: 'time',
		bind: changeAudioTime,
		bindAdditional: audioPlayPause
	}, elem);

	  this.addParameter({
		  property: 'Volume',
		  value: zone.sound ? zone.sound.source.volume.gain.value : 'N/A',
		  type: 'number',
		  cls: 'volume',
		  bind: changeVolume
	  },elem);

	  this.addParameter({
		  property: 'Scale',
		  value: zone.zoneScale,
		  type: 'number',
		  cls: 'scale',
		  bind: changeScale
	  },elem);

	  this.addParameter({
		  property: 'Position X',
		  value: Number(pos.x.toFixed(2)),
		  type: 'number',
		  cls: 'x',
		  bind: setZonePosition.bind(this, "x")
	  },elem);

	  this.addParameter({
		  property: 'Position Y',
		  value: Number(pos.z.toFixed(2)),
		  type: 'number',
		  cls: 'z',
		  bind: setZonePosition.bind(this, "z")
	  },elem);

	  this.addParameter({
		property: 'Rotation',
		value: Number((zone.containerObject.rotation.y * 180/Math.PI).toFixed(2)),
		type: 'number',
		cls: 'rotation',
		suffix: '˚',
		bind: setZoneRotation.bind(this)
	  }, elem);

	this.addNav({type: "object", direction: "left"}, elem);
	this.addNav({type: "object", direction: "right"}, elem);
  }

  initHeadGUI(object) {
	  var elem = this.addElem('Head', false);
	  let roomCode = this.roomCode;
	  function setObjectPosition(component, dx) {
		this.app.isAllowMouseDrag = true;
		let destination = object.containerObject.position.clone();
		destination[component] += dx;

		// clamp y to [-300,300]
		destination.y = Math.min(Math.max(-300,destination.y), 300);

		// move all child objects of the object
		object.setPosition(destination);

		if (object.trajectory) {
		  // move trajectory
		  if (component === 'y') {
			object.trajectory.splinePoints.forEach((pt) => {
			  pt[component] = Math.min(Math.max(-300, pt[component] + dx), 300);
			});
			object.trajectory.updateTrajectory();
		  }
		  else {
			object.trajectory.objects.forEach((obj) => {
			  obj.position[component] += dx;
			})
			object.trajectory.splinePoints.forEach((pt) => {
			  pt[component] += dx;
			});
		  }
		}
		if(roomCode != null){
		  this.dbRef.child('users').child(this.headKey).update({
			position: destination,
		  });
		}
	  }//end setObjectPosition

	  function setHeadRotation(dx) {
		this.app.isAllowMouseDrag = true;
		let rotation = (object.rotation.y + dx * Math.PI / 180);

		if (rotation < Math.PI) { rotation += Math.PI*2 }
		if (rotation > Math.PI) { rotation -= Math.PI*2 }
		object.rotation.y = rotation;
		if(roomCode != null){
		  this.dbRef.child('users').child(this.headKey).update({
			rotation: rotation,
		  });
		}
	  }

	  /* global object parameters */
	  var gElem = document.createElement('div');
	  gElem.id = "object-globals";
	  elem.appendChild(gElem);
	  gElem.style.display = this.app.isEditingObject ? 'none' : 'block';

	  this.addParameter({
		  property: 'Position X',
		  value: Number(object.containerObject.position.x.toFixed(2)),
		  type: 'number',
		  cls: 'x',
		  bind: setObjectPosition.bind(this, "x")
	  },gElem);

	  this.addParameter({
		  property: 'Position Y',
		  value: Number(object.containerObject.position.z.toFixed(2)),
		  type: 'number',
		  cls: 'z',
		  bind: setObjectPosition.bind(this, "z")
	  },gElem);

	  this.addParameter({
		  property: 'Altitude',
		  value: Number(object.containerObject.position.y.toFixed(2)),
		  type: 'number',
		  cls: 'y',
		  bind: setObjectPosition.bind(this, "y")
	  },gElem);

	  this.addParameter({
		property: 'Rotation',
		value: Number((object.rotation.y * 180/Math.PI).toFixed(2)),
		type: 'number',
		cls: 'rotation',
		suffix: '˚',
		bind: setHeadRotation.bind(this)
	  }, elem);

	  if (object.trajectory) {
		this.addTrajectory(object);
	  }
	  else {
		this.addTrajectoryDialog();
	  }

	  /* Head navigation */
	  this.addNav({type: "head", direction: "left"}, elem);
	  this.addNav({type: "head", direction: "right"}, elem);
  }


  //----- updating objects -------//

  // update parameters of sound object
  updateObjectGUI(object) {

	  // update audio time
	  var time = this.container.querySelector('.time .value');
	  this.replaceTextContent(time, object.omniSphere.sound && object.omniSphere.sound.state ? this.convertTime(object.omniSphere.sound.state.currentTime) : '0:00');

	  // update audio duration
	  var duration = this.container.querySelector('#duration');
	  this.replaceTextContent(duration, object.omniSphere.sound && object.omniSphere.sound.state ? this.convertTime(object.omniSphere.sound.state.duration) : '0:00');

	  // update audio play/pause status
	  var audioPlay = this.container.querySelector('#audio-playback');
	  audioPlay.src = object.omniSphere.sound && object.omniSphere.sound.state ? this.convertPlayPause(object.omniSphere.sound.state.isAudioPaused) : this.convertPlayPause(true);
	  audioPlay.style.opacity = object.omniSphere.sound && object.omniSphere.sound.state ? '0.8' : '0.2';

	  // update sound volume
	  var volume = this.container.querySelector('.volume .value');
	  this.replaceTextContent(volume, object.omniSphere.sound && object.omniSphere.sound.volume ? object.omniSphere.sound.volume.gain.value : 'N/A');

	  // update position parameters
	  var pos = object.containerObject.position;
	  var x = this.container.querySelector('.x .value');
	  var y = this.container.querySelector('.y .value');
	  var z = this.container.querySelector('.z .value');

	  this.replaceTextContent(x, pos.x);
	  this.replaceTextContent(y, pos.y);
	  this.replaceTextContent(z, pos.z);

	  // check if trajectory exists
	  if (object.trajectory) {
		// check if option to add trajectory still exists
		var addTrajectory = document.getElementById('add-trajectory');
		if (addTrajectory) {
		  this.container.removeChild(addTrajectory);
		  this.addTrajectory(object);
		}
		else {
		  // update trajectory parameters
		  let speed = this.container.querySelector('.speed .value');
		  if (speed && (speed.innerHTML != 0 && object.movementSpeed != 0) || (speed.innerHTML == 0 && object.movementSpeed != 0)) {
			this.replaceTextContent(speed, object.movementSpeed);
		  }

          let position = this.container.querySelector('.position .value');
          if (position) {
            this.replaceTextContent(position, object.trajectoryClock);
          }
          
		}
	  }

	  // check if finished scrubbing through audio
	  if (object.omniSphere.sound && object.omniSphere.sound.state.isChangingAudioTime && Object.keys(this.dragEvent).length === 0) {
		object.omniSphere.sound.state.isChangingAudioTime = false;
	  }

	  // update number of cones
	  // this.replaceTextContent(document.getElementById('cone-count').querySelector('.value'), object.cones.length);

	  // get cone information
	  if (object.cones && object.cones.length > 0) {
        let addButton = document.getElementById('add-cone');
        if(!addButton.classList.contains('add-cone-object-view')) {
            addButton.classList.add('add-cone-object-view');
        }


		const cones = this.container.getElementsByClassName('cone');
		this.app.interactiveCone == this.app.interactiveCone || object.cones[0];
		object.cones.forEach((cone, i) => {
		  if (cone === this.app.interactiveCone) {
			cones[i].style.display = 'block';
			this.replaceTextContent(cones[i].getElementsByTagName('h4')[0], 'CONE ' + (i+1) + ' OF ' + object.cones.length);
			this.replaceTextContent(cones[i].querySelector('.lat .value'), cone.lat * 180 / Math.PI, 0);
			this.replaceTextContent(cones[i].querySelector('.long .value'), cone.long * 180 / Math.PI, 0);
			this.replaceTextContent(cones[i].querySelector('.volume .value'), cone.sound.volume.gain.value, 2, true);
			this.replaceTextContent(cones[i].querySelector('.spread .value'), cone.sound.spread, 2, true);
			this.replaceTextContent(cones[i].querySelector('.time .value'), this.convertTime(cone.sound.state.currentTime));
			this.replaceTextContent(cones[i].querySelector('#duration'), this.convertTime(cone.sound.state.duration));
			cones[i].querySelector('#audio-playback').src = this.convertPlayPause(cone.sound.state.isAudioPaused);
			cones[i].querySelector('#audio-playback').style.opacity = cone.sound && cone.sound.state ? '0.8' : '0.2';
			if (cone.sound.state.isChangingAudioTime && Object.keys(this.dragEvent).length === 0) {
			  cone.sound.state.isChangingAudioTime = false;
			}
		  }
		  else {
			cones[i].style.display = 'none';
		  }
		});
	  }

  }

  // update parameters of sound zone
  updateSoundzoneGUI(zone) {
	  var pos = zone.containerObject.position;
	  var x = this.container.querySelector('.x .value');
	  var z = this.container.querySelector('.z .value');
	  var rotation = this.container.querySelector('.rotation .value');
	  var volume = this.container.querySelector('.volume .value');
	  var time = this.container.querySelector('.time .value');
	  var duration = this.container.querySelector('#duration');
	  var audioPlay = this.container.querySelector('#audio-playback');
	  var scale = this.container.querySelector('.scale .value');

	  if (zone.sound && zone.sound.state && !zone.sound.state.isAudioPaused && !zone.isChangingAudioTime) {
		var currentTime = (Date.now() - zone.sound.state.startedAt) / 1000;
		currentTime = currentTime % Math.floor(zone.sound.state.duration);
		zone.sound.state.currentTime = currentTime;
	  }

	  // check if finished scrubbing through audio
	  if (zone.isChangingAudioTime && Object.keys(this.dragEvent).length === 0) {
		zone.isChangingAudioTime = false;
	  }

	  var volumeValue = '';
	  if (!zone.isPlaying) {
		volumeValue = zone.volume ? zone.volume : 'N/A';
	  }
	  else {
		volumeValue = zone.sound && zone.sound.source ? zone.sound.source.volume.gain.value : 'N/A';
	  }

	  this.replaceTextContent(x, pos.x);
	  this.replaceTextContent(z, pos.z);
	  this.replaceTextContent(rotation, zone.containerObject.rotation.y * 180 / Math.PI);
      this.replaceTextContent(volume, volumeValue);
	  this.replaceTextContent(time, (zone.sound && zone.sound.state) ? this.convertTime(zone.sound.state.currentTime) : '0:00');
	  this.replaceTextContent(duration, (zone.sound && zone.sound.state) ? this.convertTime(zone.sound.state.duration) : '0:00');
	  audioPlay.src = zone.sound && zone.sound.state ? this.convertPlayPause(zone.sound.state.isAudioPaused) : this.convertPlayPause(true);
	  audioPlay.style.opacity = zone.sound && zone.sound.state ? '0.8' : '0.2';
	  this.replaceTextContent(scale, zone.zoneScale, 2);
  }

  // update parameters of head
  updateHeadGUI(object) {

	// update position parameters
	var pos = object.containerObject.position;
	var x = this.container.querySelector('.x .value');
	var z = this.container.querySelector('.z .value');
	var y = this.container.querySelector('.y .value');
	var rotation = this.container.querySelector('.rotation .value');
	var mouse = this.container.querySelector('.mouse .value');

	this.replaceTextContent(x, pos.x);
	this.replaceTextContent(z, pos.z);
	this.replaceTextContent(y, pos.y);

	if (object.rotation.y < Math.PI) { object.rotation.y += Math.PI*2 }
	if (object.rotation.y > Math.PI) { object.rotation.y -= Math.PI*2 }
	this.replaceTextContent(rotation, (object.rotation.y * 180 / Math.PI));

	// check if trajectory exists
	if (object.trajectory) {

	  // check if option to add trajectory still exists
	  var addTrajectory = document.getElementById('add-trajectory');
	  if (addTrajectory) {
		this.container.removeChild(addTrajectory);
		this.addTrajectory(object);
	  }
	  else {
		// update trajectory parameters
		let speed = this.container.querySelector('.speed .value');
        // && (speed.innerHTML != 0 && object.movementSpeed != 0) || (speed.innerHTML == 0 && object.movementSpeed != 0)
		if (speed) {
		  this.replaceTextContent(speed, object.movementSpeed);
		}
	  }
	}
  }

  // ------------ event callbacks ------------ //
  // attach a sound to an object
  addSound(e) {
	var obj = this.obj;
	var span = e.target;
	var input = document.getElementById('soundPicker');
	// listen to click
	var self = this;
	input.onchange = function(e) {
	  const file = e.target.files[0];

	  input.parentNode.reset();

	  if (file && Math.round((file.size / 1024)) <= 51200) {
		// load sound onto obect
		switch (obj.type) {
		  case 'SoundTrajectory':
			obj = obj.parentSoundObject;

		  case 'SoundObject':
			// check if sound is attaching to omnisphere or cone
			if (span.parentNode.id === 'omnisphere-sound-loader') {
			  obj.loadSound(file, self.app.audio, self.app.isMuted, obj).then((sound) => {
				if (obj.omniSphere.sound && obj.omniSphere.sound.volume) {
				  // copy properties of previous sound
				  sound.volume.gain.value = obj.omniSphere.sound.volume.gain.value;
				  sound.panner.refDistance = obj.omniSphere.sound.panner.refDistance;
				  sound.panner.distanceModel = obj.omniSphere.sound.panner.distanceModel;
				}

				obj.omniSphere.sound = sound;
				obj.omniSphere.sound.name = file.name;
				self.replaceTextContent(span, file.name);
				obj.setAudioPosition(obj.omniSphere);
				span.nextSibling.style.display = 'inline-block';
			  });
			} else {
			  // replace sound attached to existing cone
			  const text = span.innerText || span.textContent;
			  let cone = null;

			  if (obj.cones && obj.cones.length > 0 && text) {
				cone = obj.cones.find(c => c.filename === text);
			  }

			  function attachCone(storageRef) {
				obj.loadSound(file, self.app.audio, self.app.isMuted, cone).then((sound) => {
				  if(obj.cones.length <= 0 && self.roomCode != null){
					obj.dbRef.child('objects').child('cones').push();
				  }
				  let objectName = obj.containerObject.name;
				  let values = {
					volume: 1,
					spread: 0.5,
					longitude: 0,
					latitude: 0,
					key: obj.headKey,
				  }
				  if (cone) {
					// copy properties of previous cone
					obj.applySoundToCone(cone, sound);
					obj.setAudioPosition(cone);
					// replace text with file name
					cone.filename = file.name;
					self.app.interactiveCone = cone;
					self.replaceTextContent(span, file.name);

					var materialColor = self.app.isPlaying ? cone.baseColor.getHex() : 0x8F8F8F;
					cone.material.color.setHex(materialColor);

					// only play if global play
					if (!self.app.isPlaying) {
					  obj.stopConeSound(cone);
					}
					
					values.volume = cone.sound.volume.gain.value;
					values.spread = cone.sound.spread;
					values.longitude = cone.long;
					values.latitude = cone.lat;
				  } else {
					cone = obj.createCone(sound);
					cone.file = file;
					cone.filename = file.name;
					self.addCone(cone);

					// parallel structure to hold sounds for forwarding out
					var copySound = new Object();
					// copy by value instead of reference to protect against remove case
					obj.coneSounds[cone.uuid] = Object.assign(copySound, cone.sound);

					self.app.undoableActionStack.push(new Action(obj, 'addCone'));
					self.app.undoableActionStack[self.app.undoableActionStack.length - 1].secondary = cone;
					self.app.interactiveCone = cone;

					// point cone at camera
					obj.pointCone(cone, self.app.camera.threeCamera.position);
					values.longitude = cone.long;
					values.latitude = cone.lat;
					// if (!self.app.isPlaying) {
					//   obj.stopConeSound(cone);
					// }
				  }
				  if(self.roomCode != null){
					let coneUUID = cone.uuid;
					let isConePlaying = !cone.sound.state.isAudioPaused;
					let upload = storageRef.child('soundObjects/' + objectName + '/' +  coneUUID + '/' + file.name).put(file);
					let tempRef = obj.dbRef;
					obj.finishUploadingSound = false;
					upload.on('state_changed', function(snapshot){
					  var progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
					  console.log('Upload is ' + progress + '% done');
					}, function(error){
					  console.log('Problem uploading file');
					}, function(){
					  tempRef.child('objects').child(obj.containerObject.name).child('cones').child(coneUUID).update({
						type: "cone",
						parent: obj.containerObject.name,
						uuid: cone.uuid,
						sound: file.name,
						volume: cone.sound.volume.gain.value,
						spread: cone.sound.spread,
						longitude: cone.long,
						latitude: cone.lat,
						lastEdit: values.key,
						isPlaying: isConePlaying,
					  });
					  obj.finishUploadingSound = true;
					});
				  }
                  let addButton = document.getElementById('add-cone');
                  addButton.classList.add('add-cone-object-view');
                  if (addButton.style.position == "absolute") {
                    if (self.app.isEditingObject) {
                        addButton.style.top = "167.5px";
                    } else {
                        addButton.style.top = "228.51px";
                    }
                  }
                  
				});
			  }
			  // hard-coded the timeout but create the sound
			  // after the tween is finished
			  if (!cone && !self.app.isEditingObject) {
				self.toggleEditObject();
				window.setTimeout(attachCone.bind(null, self.stoRef), 800);
			  } else { 
				attachCone(self.stoRef);
			  }
			}
			break;

		  case 'SoundZone':
			// add sound to zone
            let oldIsAudioPaused = false;
            if (obj.sound) {
                oldIsAudioPaused = obj.sound.state.isAudioPaused;
            }
			obj.clear();
			obj.loadSound(file, self.app.audio, self.app.isMuted).then((sound) => {
				if(!self.app.isMuted){
					obj.playSound();
				}
                if (oldIsAudioPaused) {
                    obj.sound.state.isAudioPaused = true;
                    obj.shape.material.color.setHex(0x8F8F8F);
                }
			});
			self.replaceTextContent(span, file.name);
			span.nextSibling.style.display = 'inline-block';
			break;

		  default:
			break;
		}
	  } else {
		  alert('File too large. Please select a file under 50 MB');
	  }
	};

	input.click();
  }

  detachSound(fileSpan, removeSpan) {
	fileSpan.innerHTML = 'None';
	removeSpan.style.display = 'none';
	let filename = this.obj.filename;

	if (this.obj.type === "SoundObject") {
	  this.obj.disconnectSound();
	  this.obj.filename = null;
	  if(this.roomCode != null){
		this.dbRef.child('objects').child(this.obj.containerObject.name).update({
		  sound: null,
		  isPlaying: null,
		  lastEdit: this.headKey
		});
		this.stoRef.child('soundObjects/'+ this.obj.containerObject.name +'/' + filename).delete().then(() => {
		  console.log("deleted file successfully");
		}).catch(function(error){
		  console.log(error);
		});
	  }
	}
	if (this.obj.type === "SoundZone") {
      let filename = this.obj.filename;
	  this.obj.clear();

	  var materialColor = this.app.isPlaying ? 0xFF1169 : 0x8F8F8F;
	  this.obj.shape.material.color.setHex(materialColor);
	  if(this.roomCode != null){
		this.dbRef.child('zones').child(this.obj.containerObject.name).update({
		  sound: null,
		  isPlaying: null,
		  lastEdit: this.headKey
		})
		this.stoRef.child('zones/'+ this.obj.containerObject.name +'/' + filename).delete().then(() => {
		  console.log("deleted file successfully");
		}).catch(function(error){
		  console.log(error);
		});
	  }
      this.obj.filename = null;
	}
  }

  // move into/out of object edit mode
  toggleEditObject() {
	if (!this.app.isEditingObject) {
	  var span = this.container.querySelector('.edit-toggle .value');
	  this.editor = span;
	  this.container.classList.add('editor');
	  this.replaceTextContent(span, 'Zoom Out');
	  // Mutes the objects besides the one being edited
	  this.app.muteAll(this.app.activeObject);

	  // disable duplicate functionality
	  this.toggleClass('#guis', '.baseParam > h4 .center-panel', 'disabled-color', false);
	  this.toggleClass('#guis', '.baseParam > h4 .center-panel > span', 'not-allowed', false, 'cursor');
      
      let addButton = document.getElementById('add-cone');

	  this.app.enterEditObjectView();

	  // once entered object view, these values should reflect new changes
	   let guiHeight = document.getElementById('guis').scrollHeight + 20;
	   let baseParams = document.getElementsByClassName('baseParam')[0].scrollHeight;

       if (addButton.style.position == 'absolute' && addButton.style.position.length > 0) {
            addButton.style.top = "167.5px";
        }

	}
	else {
	  // re-enable duplicate functionality, move out of object edit mode
	  this.toggleClass('#guis', '.baseParam > h4 .center-panel', false, 'disabled-color');
	  this.toggleClass('#guis', '.baseParam > h4 .center-panel > span', 'pointer', false, 'cursor');
	  
	  this.app.exitEditObjectView();
	  let guiHeight = document.getElementById('guis').scrollHeight;
	  let baseParams = document.getElementsByClassName('baseParam')[0].scrollHeight;
		// move add cone button down to match menu
		let addButton = document.getElementById('add-cone');
        
        if (addButton.style.position == 'absolute' && addButton.style.position.length > 0) {
            addButton.style.top = "228.51px";
        }
	}
  }

  deleteObject(){
	this.app.interactiveCone = false;
	if(this.app.activeObject.type == 'SoundTrajectory'){
		this.app.activeObject = this.app.activeObject.parentSoundObject;
	}
	// ensure to delete object, not the trajectory lol
	var keyboardEvent = new KeyboardEvent("keydown", {
		bubbles : true,
		cancelable : true,
		char : "Backspace",
		key : "Backspace",
		shiftKey : false,
		keyCode : 8
	});
	keyboardEvent.simulate = true;
	document.dispatchEvent(keyboardEvent);
  }

  exitEditorGui() {
	this.app.unmuteAll();
	var span = this.container.querySelector('.edit-toggle .value');
	this.editor = null;
	this.container.classList.remove('editor');
	this.replaceTextContent(span, 'Zoom In');
  }

  copyItem() {
	  if(!this.app.isEditingObject){
		this.app.copySelectedItem();
	  }
  }

  toggleClass(baseProperties, className, optionToAdd, optionToRemove, singleOperation = null){
	let container = document.querySelector(baseProperties);
	let propertyElems = container.querySelectorAll(className);
	for(let element of propertyElems){
		if(singleOperation) {
			element.style[singleOperation] = optionToAdd;
		} 
		let classList = element.classList;
		if(optionToRemove){
			classList.remove(optionToRemove);
		}
		if(optionToAdd){
			classList.add(optionToAdd);
		}
		
	}
 
  }


  toggleAllowMouseDrag() {
	this.app.isAllowMouseDrag = !this.app.isAllowMouseDrag;
  }

  convertPlayPause(isAudioPaused) {
	if (isAudioPaused) {
	  return this.app.playBtnSrc;
	}
	return this.app.pauseBtnSrc;
  }

  convertTime(inputTime) {
	var seconds = Math.floor(Math.round(inputTime) % 60);
	if (seconds < 10) {
	  seconds = "0" + seconds;
	}
	var minutes = Math.floor(Math.round(inputTime) / 60);
	return minutes + ":" + seconds;
  }

  changeAudioPlay(e) {
	const l = this.listeners.find(l => l.elem === e.target || l.elem === e.target.parentNode);

	if (l && l.callback) {
	  this.clickEvent.call = l.callback;
	  this.clickEvent.call();
	}
  }

  // switch between different cones and objects
  nav(e) {
	if (e.type === 'cone') {
	  let i = this.obj.cones.indexOf(this.app.interactiveCone);
	  if (i > -1) {
		i = e.direction === 'left' ? i - 1 + this.obj.cones.length : i + 1;
		this.app.interactiveCone = this.obj.cones[i%this.obj.cones.length];
	  }
	}
	else {
	  let everyObject = [].concat(this.app.soundObjects, this.app.soundZones);
	  if (!this.app.isEditingObject){
		  everyObject.push(this.app.headObject);
	  }
	  let i = everyObject.indexOf(this.obj);
	  if (i > -1) {
		i = e.direction === 'left' ? i - 1 + everyObject.length : i + 1;
		this.app.setActiveObject(everyObject[i%everyObject.length]);
		this.app.tweenToObjectView();
	  }
	}
  }

  startDragging(e) {
	this.app.controls.disable();

	const l = this.listeners.find(l => l.elem === e.target || l.elem === e.target.parentNode);

	if (l && l.callback) {
	  this.dragEvent.call = l.callback;
	  this.dragEvent.editing = e.target;
	  this.dragEvent.x = e.x;
	}
  }
  drag(e) {
	if (!this.dragEvent.editing) {
	  return;
	}
	const dx = (e.x == undefined) ? e.movementX : e.x - this.dragEvent.x;
	this.dragEvent.x = e.x;
	this.dragEvent.call(dx);
  }
  stopDragging(e) {
	if (!this.dragEvent.editing) {
	  return;
	}

	this.dragEvent = {};
	this.app.controls.enable();
  }

  typingInput(e) {
	var keyCode = (e.keyCode ? e.keyCode : e.which);

	var charStr = String.fromCharCode(keyCode);

	var valid =
		(keyCode > 47 && keyCode < 58)   || // number keys
		keyCode == 13                    || // return key
		charStr == '-' || charStr == '.';   // negative sign and decimal

	if (!valid && this.roomCode != null) {
		e.preventDefault();
		e.target.blur();
	}

	var inputValue = e.target.value;

	// Check for enter and that value is a number
	if (e.keyCode == 13 && !isNaN(inputValue)) {
	  const l = this.listeners.find(l => l.elem === e.target || l.elem === e.target.parentNode);

	  // Adjust for dx for drag versus straight input
	  var factor = 1;
	  if (e.target.parentNode.parentNode.className === "volume") {
		factor = 50;
	  }
	  else if (e.target.parentNode.parentNode.className === "speed") {
		factor = 10;
	  }
	  else if (e.target.parentNode.parentNode.className === "spread") {
		factor = 100;
	  }
	  else if (e.target.parentNode.parentNode.className === "scale") {
		factor = 50;
	  }
	  const dx = (inputValue - e.target.defaultValue) * factor;

	  // Apply change
	  if (l && l.callback) {
		this.typeEvent.call = l.callback;
		this.typeEvent.call(dx);
		this.display();
	  }
	}
  }

addSwipeEvents(div, title, isObject) {
	// add touch interactions
	let x = null,
		y = null,
		dx = null,
		dy = null;
	let controls = this.app.controls;
	title.onmousedown = function(e) {
	  x = e.clientX;
	  y = e.clientY;
	  controls.disable();
	};

	div.onmousemove = function(e) {
	  if (x == null || y == null) { return; }
	  dx = e.clientX - x;
	  dy = e.clientY - y;
	  if ( Math.abs(dx) > 15 ) {
		if (dx > 0) {
		  title.style.marginLeft = Math.min(dx-10/2, 50) + 'px';
		}
		else {
		  title.style.marginLeft = Math.max(dx+10/2, -50) + 'px';
		}
	  }
	  else {
		title.style.marginLeft = 0;
	  }
	};

	var self = this;

	div.onmouseup = function() {
	  if (x == null || y == null) { return; }
	  title.style.marginLeft = 0;
	  if (Math.abs(dx) >= 40) {
		const direction = dx < 0 ? "left" : "right";
		const objectType = isObject ? "object" : "cone";
		self.nav({direction: direction, type:objectType});
	  }
	  x = y = dx = dy = null;
	  controls.enable();
	};

	div.onmouseleave = function (e) {
	  if (x == null || y == null) { return; }
	  if (e.target.parentNode != div) {
		div.onmouseup();
	  }
	};
  }
  //---------- dom building blocks -----------//
  // add a new div
  addElem(name, addEditParameter, siblingAfter) {
	  var div = document.createElement('div');
	  div.classList += 'baseParam';
	  var title = document.createElement('h4');
	  var p = document.createElement('span');
	  p.appendChild(document.createTextNode(name));
	  p.style.fontWeight = 'bold';
	  p.style.display = 'block';
	  p.style.marginBottom = '0.8em';
	  p.className += ' title';
	  title.appendChild(p);
	  div.appendChild(title);
	  this.container.insertBefore(div, siblingAfter || null);
	  if (addEditParameter) {
		// add three horizontal parameters for editing: Zoom, Duplicate, Delete
		this.addParameter({
		  value: this.app.isEditingObject ? 'Zoom Out' : 'Zoom In',
		  cls: 'edit-toggle top-gui left-panel',
		  events: [{
			type: 'click',
			callback: this.toggleEditObject.bind(this)
		  }]
		}, title);

		this.addParameter({
			value: 'Duplicate',
			cls: 'top-gui center-panel',
			events: [{
			  type: 'click',
			  callback: this.copyItem.bind(this)
			}]
		}, title);

		this.addParameter({
			value: 'Delete',
			cls: 'top-gui right-panel',
			events: [{
			  type: 'click',
			  callback: this.deleteObject.bind(this)
			}]
		}, title);


	  }

	  if (addEditParameter || siblingAfter) {
		// TODO: prevent Swipe Event to head in edit mode
		this.addSwipeEvents(div, title, addEditParameter);
	  }
	  return div;
  }

  // add a line for the parameter in the UI
  // parameter p can contain properties:
  //      property
  //      value
  //      cls:     class name for quicker dom access
  //      type:    number, file, etc?
  //      suffix:  a string to be appended to the value
  //      events:  array of event names & callback functions
  addParameter(p, container) {
	  container = container || this.container;

	  var div = document.createElement('div');
	  if (p.cls) { div.className = p.cls; }
	  if (p.button) { div.style.padding = "4%"; }
	  var prop = document.createElement('span');
	  prop.className = 'property';// fade-gray-text';
	  prop.appendChild(document.createTextNode(p.property));
  
	  var val = document.createElement('span');
	  val.className = 'valueSpan';
	
	  if (!p.button) { 
		  val.style.maxWidth = "max-width: 90px;";
	  }

	  if (p.type === 'number' || p.type === 'time') {
		  val.style.cursor = 'ew-resize';
	  }

	  if (p.events) {
		  p.events.forEach(function(evt) {
			if (!evt.target) {
			  val['on'+evt.type] = evt.callback;
			}
			else {
			  evt.target.addEventListener(evt.type, evt.callback)
			}
		  })
	  }

	  // shortcut to apply "startDragging" mousedown event
	  if (p.bind) {
		val.onmousedown = this.startDragging.bind(this);
		val.onkeypress = this.typingInput.bind(this);
		this.listeners.push({
		  elem: val,
		  callback: p.bind
		})
	  }

	  // Create an input text box if is a number
	  if (p.type === 'number') {
		var input = document.createElement('input');
		input.type = 'text';
		input.className = 'value';
		input.size = '8';
		input.defaultValue = p.value;
		input.disabled = false;
		input.style.color = "#5d5e5d";
		val.appendChild(input);

		if (p.suffix) {
		  var text = document.createTextNode(p.suffix);
		  val.appendChild(text);
		  input.after(text);
		}
	  }
	  else if (p.type === 'time') {
		// Creating element to show audio playback
		var span = document.createElement('span');
		span.className = 'value';
		span.style.fontWeight = 'normal';
		span.id = 'time';
		span.appendChild(document.createTextNode(p.value));
		val.appendChild(span);

		var durationSpan = document.createElement('span');
		durationSpan.style.fontWeight = 'normal';
		durationSpan.id = "duration";
		durationSpan.className = 'value';
		durationSpan.innerHTML = '0:00';
		
		span.after(document.createTextNode('\u00A0\u00A0'));
		span.after(durationSpan);
		span.after(document.createTextNode("/"));

		// Append play/pause button
		var audioVal = document.createElement('span');
		audioVal.className = 'valueSpan';

		var audioBtn = document.createElement('img');
		audioBtn.id = "audio-playback";
		audioBtn.style.height = "12px";
		audioBtn.style.width = "12px";
		audioBtn.style.opacity = "0.2";
		audioBtn.src = this.convertPlayPause(true);

		audioVal.appendChild(audioBtn);

		// Attach play/pause button events if have additional binding
		if (p.bindAdditional) {
		  audioVal.onclick = this.changeAudioPlay.bind(this);
		  this.listeners.push({
			elem: audioVal,
			callback: p.bindAdditional
		  })
		}
	  }

	  else {
		if (p.suffix) {
			var span = document.createElement('span');
			span.className = 'value';
			span.appendChild(document.createTextNode(p.value));
			val.appendChild(span);
			val.appendChild(document.createTextNode(p.suffix));
		}
		else {
			val.appendChild(document.createTextNode(p.value));
			val.className += ' value';
			if(p.button){
				val.className += ' button';
				val.style.fontWeight = 'bold';

				// TODO: change solution to add extra bottom padding for last element in menu
				if (p.value[4] == 'T') {
					div.style.paddingBottom = '15px';
				}
			} 
			if(p.innercls){
			  val.className += ' f' + p.innercls;
			}
		}
	  }


	  // append all values to dom
	  if (p.property != undefined) { div.appendChild(prop); }
	  if (p.value != undefined) { div.appendChild(val); }
	  if (p.type === 'time') { div.appendChild(audioVal); }

	  if (p.type == 'file-input') {
		val.style.fontWeight = 'normal';
		var removeFile = document.createElement('span');
		removeFile.appendChild(document.createTextNode('×'));
		removeFile.className = 'remove-file';
		div.appendChild(removeFile);

		removeFile.style.display = p.display ? 'inline-block' : 'none';
		removeFile.onclick = this.detachSound.bind(this, val, removeFile);
	  }
      
	  container.append(div);
	  return div;
  }

  // updating text in html
  replaceTextContent(parent, text, sigfigs, float) {
	// while(parent.firstChild) { parent.removeChild(parent.firstChild); }
	if (!isNaN(text)) {
	  if (isNaN(sigfigs)) {
		text = (+text).toFixed(2);
	  }
	  else {
		text = (+text).toFixed(sigfigs);
	  }
	  if (!float) text = +text;
	}
	parent.innerHTML = text;
	parent.defaultValue = text;
	// parent.appendChild(document.createTextNode(text));
  }

}

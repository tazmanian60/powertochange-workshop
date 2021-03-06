import { h, Component } from 'preact';
import { Observable } from "rxjs";
import * as THREE from "three";
import subtract from "lodash/subtract";
const OrbitControls = require("three-orbit-controls")(THREE);
// import "./lib/line_segments2";
// import "./lib/line_segments_geometry";
// import "./lib/line2";

import Entity from "./entity"
import Window, { addWindow } from "./entity/window";
import { MouseButton, getPosition, checkForIntersection, clampedNormal, get2DCoords } from "./lib/utils";
import { extrudePoints, highlightMaterial, shadowMaterial, edgeMaterial } from "./lib/materials";
import { area } from "./lib/clipper";

export default class Scene extends Component {

  constructor(props) {
    super(props);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;

    this.render3D = this.render3D.bind(this);
    this.addEvents = this.addEvents.bind(this);
  }

  shouldComponentUpdate(nextProps, nextState) {
    return false;
  }

  componentDidMount() {
    const { width=400, height=400, bgColor=0xcccccc } = this.props;

    this.scene = new THREE.Scene();

    this.lines = new THREE.Line(new THREE.Geometry(), highlightMaterial);
    this.scene.add(this.lines);

    this.scene.add(new THREE.AmbientLight(0xFFFFFF, 1.1));

    const pLight = new THREE.PointLight(0xDDCEB1, 0.3);
    pLight.position.copy(new THREE.Vector3(8, 20, -10));
    pLight.lookAt(new THREE.Vector3(0, 2, 0))
    pLight.shadow.mapSize.width = 1024;
    pLight.shadow.mapSize.height = 1024;
    pLight.castShadow = true;
    this.scene.add(pLight);

    var ground = new THREE.GridHelper(30, 30, 0xDDDDDD, 0xEEEEEE);
    ground.rotation.x = -Math.PI;
    ground.position.set(0, -0.005, 0);
    this.scene.add(ground);


    const pg = new THREE.PlaneGeometry(30, 30, 1, 1);
    pg.rotateX(Math.PI / 2);
    const me = new THREE.Mesh(pg, shadowMaterial);
    me.receiveShadow = true;

    this.scene.add(me);


    this.renderer.setClearColor(bgColor);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(width, height);

    this.raycaster = new THREE.Raycaster();

    this.camera = new THREE.PerspectiveCamera(45, width/height, 0.1, 1000);

    this.controls = new OrbitControls(this.camera);
    this.controls.maxPolarAngle = 1.5;
    const savedControls = JSON.parse(localStorage.getItem('controlsState'));
    if(savedControls){
      const { target, objectPosition, objectRotation } = savedControls;
      this.controls.target.copy(target);
      this.controls.object.position.copy(objectPosition);
      this.controls.object.rotation.copy(objectRotation);
    } else {
      this.camera.position.set(10, 15, -5);
      this.camera.lookAt(new THREE.Vector3(0, 4, 0));
    }

    window.addEventListener('unload', () => {
      localStorage.setItem('controlsState', JSON.stringify({
        target: this.controls.target,
        objectPosition: this.controls.object.position,
        objectRotation: this.controls.object.rotation
      }));
    });

    this.entity = new Entity();
    this.scene.add(this.entity);

    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    // this.planeHelper = new THREE.PlaneHelper(this.plane, 10, 0xffff00);
    // this.scene.add(this.planeHelper);

    this.addEvents();
  }

  addEvents() {
    var line = new THREE.Line(new THREE.Geometry(), edgeMaterial);
    this.scene.add( line );

    let mouseDown = false;
    // mouse actions

    const interval$ = Observable.interval(2000);

    const wheel$ =
      Observable
        .fromEvent(this.renderer.domElement, 'wheel');

    const mouseMove$ =
      Observable
        .fromEvent(this.renderer.domElement, 'mousemove')
        .share();

    const mouseUp$ =
      Observable
        .fromEvent(document, 'mouseup')
        .do(_ => {
          mouseDown = false;
          this.controls.enabled = true;
        })
        .share();

    const mouseDown$ =
      Observable
        .fromEvent(this.renderer.domElement, 'mousedown')
        .do(_ => mouseDown = true)
        .share();

    const keyDown$ =
      Observable
        .fromEvent(document, 'keydown')
        .do(event => console.log(event.keyCode))
        .distinct()
        .subscribe();

    const mouseDownAndMoving$ =
      mouseDown$
        .switchMapTo(mouseMove$)
        .takeUntil(mouseUp$)
        .repeat();

    // threejs intersections actions

    const intersections$ =
      Observable.merge(mouseMove$, mouseUp$)
        .throttleTime(20)
        .map(checkForIntersection.bind(this))
        // .do(console.log)
        .share();

    // let l = new THREE.Line3();
    // let minDistance;
    // let closestEdgeIndex;
    // let intersectPoint;
    // let positions;
    // let i;
    // let closestPoint;
    // let distance;
    // this.scene.add(l);
    // const distinctIntersections$ =
    //   intersections$
    //     .do(intersections => {
    //       if (intersections.length > 0) {
    //         minDistance = 1;
    //         intersectPoint = intersections[0].point;
    //         positions = this.entity.children[0].edgesGeometry.getAttribute("position").array;
    //         for(i = 0; i < positions.length;i+=2) {
    //           l.start.fromArray(positions,i*3);
    //           l.end.fromArray(positions,i*3+3);
    //           closestPoint = l.closestPointToPoint(intersectPoint, false, closestPoint);
    //           distance = closestPoint.distanceTo(intersectPoint);
    //           if (distance < minDistance) {
    //             minDistance = distance;
    //             closestEdgeIndex = i;
    //           }
    //         }
    //         // return [minDistance, intersections];
    //       }
    //       if (minDistance < 0.2) {
    //         const start = new THREE.Vector3().fromArray(positions, closestEdgeIndex*3);
    //         const end = new THREE.Vector3().fromArray(positions, closestEdgeIndex*3+3);
    //         if (start.z !== end.z && start.y > 0) {
    //           line.geometry.dispose();
    //           const geometry = new THREE.Geometry();
    //           geometry.vertices.push(start);
    //           geometry.vertices.push(end);
    //           line.geometry = geometry;
    //           line.visible = true;
    //         } else {
    //           line.visible = false;
    //         }
    //       }
    //     })

    const distinctIntersections$ =
      intersections$
        .distinctUntilChanged((x, y) => {
          if (x.length > 0 && y.length > 0) {
            return x[0].faceIndex === y[0].faceIndex;
          } else {
            return (x.length === y.length)
          }
        })
        .do( intersections => {
          if (!mouseDown) {
            if (intersections.length > 0) {

              const verts = [...intersections[0].face.polygon.vertices];
              line.visible = true;
              line.geometry.dispose();
              const geometry = new THREE.Geometry();

              if (verts.length === 4) {
                geometry.vertices.push(verts[0]);
                geometry.vertices.push(verts[2]);
                geometry.vertices.push(verts[3]);
                geometry.vertices.push(verts[1]);
                geometry.vertices.push(verts[0]);
              } else {
                geometry.vertices.push(verts[0]);
                geometry.vertices.push(verts[1]);
                geometry.vertices.push(verts[2]);
                geometry.vertices.push(verts[3]);
                geometry.vertices.push(verts[4]);
                geometry.vertices.push(verts[0]);
              }
              line.geometry = geometry;
            } else {
              line.visible = false;
            }
          }
        })

    const faceMouseDown$ =
      mouseDown$
        .withLatestFrom(intersections$)
        .filter( ([event, intersections]) => intersections.length > 0)
        .do(_ => this.controls.enabled = false)
        .share();

    const clickExtrude$ =
      faceMouseDown$
        .do( ([event, intersections]) => {
          const direction = (buttons === MouseButton.PRIMARY) ? 1 : -1;
          const { polygon } = intersections[0].face;
          polygon.extrude(1 * direction);
        });

    // house specific actions

    const intersectionPt = new THREE.Vector3();
    let is;

    const roofMouseDown$ =
      faceMouseDown$
        .filter( ([event, intersections]) => {
          const intersection = is = intersections[0];//intersections.find(i => i.face);
          const { face } = intersection;
          return (
            face.normal.y !== 0 ||
            face.normal.y !== -0
          );
        })
        .do( ([event, intersections]) => {
          const { polygon } = intersections[0].face;
          const direction = (event.buttons === MouseButton.PRIMARY) ? 1 : -1;
          this.entity.addFloor(direction);

          this.props.updateMetrics({
            floors: [this.entity.floors, ''],
            height: [Math.max(...this.entity.children[0].geometry.vertices.map(v => v.y)), 'm']
          });

          line.visible = true;
          line.geometry.verticesNeedUpdate = true;
        })
        .do(_ => console.log('roof'));

    const wallMouseDown$ =
      faceMouseDown$
        .filter( ([event, intersections]) => {
          const intersection = is = intersections[0];//intersections.find(i => i.face);
          const { face } = intersection;
          return (
            face.normal.x === 1 ||
            face.normal.x === -1
          );
        })
        .do( ([event, intersections]) => {
          const { point, face } = intersections[0];
          this.plane.setFromCoplanarPoints(
            point.clone(),
            point.clone().add(new THREE.Vector3(0,1,0)),
            point.clone().add(face.normal.normalize())
          );
        })
        .do(_ => console.log('wall'));

    const endWallMouseDown$ =
      faceMouseDown$
        .filter( ([event, intersections]) => {
          const intersection = is = intersections[0];
          const { face } = intersection;

          return (
            face.normal.z === 1 || face.normal.z === -1
          );
        })
        .do( ([event, intersections]) => {
          const { polygon } = intersections[0].face;
          // console.log(event)
          const direction = (event.buttons === MouseButton.PRIMARY) ? 1 : -1;
          polygon.extrude(1.2 * direction);
          polygon.geometry.verticesNeedUpdate = true;
          polygon.geometry.computeBoundingSphere();

          this.entity.children[0].edgesGeometry.geometry = polygon.geometry;

          const endPoints = is.object.geometry.vertices.slice(0, is.object.geometry.vertices.length/2).map(v => ([v.x, v.y]));
          // const endWallArea = [area(endPoints), 'm²'];
          const groundPoints = is.object.geometry.vertices.filter(v => v.y === 0);
          const length = [Math.abs(groundPoints[1].z - groundPoints[2].z), 'm'];

          this.props.updateMetrics({ length });

          line.visible = true;
          line.geometry.verticesNeedUpdate = true;

        })
        .do(_ => console.log('end wall'));

    // house actions

    const wallDrag$ =
      wallMouseDown$
        .switchMapTo(mouseMove$)
        .takeUntil(mouseUp$)
        .do(_ => console.log('dragging wall'))
        .do(_ => {
          this.raycaster.ray.intersectPlane(this.plane, intersectionPt);
          is.face.polygon.vertices.forEach(vertex => {
            if (vertex.x > 0) {
              vertex.x = Math.min(Math.max(intersectionPt.x, 0.0001), 5);
            } else if (vertex.x < 0) {
              vertex.x = Math.max(Math.min(intersectionPt.x, -0.0001), -5);
            }
          });
          is.face.polygon.geometry.verticesNeedUpdate = true;

          this.entity.children[0].edgesGeometry.geometry = is.face.polygon.geometry;

          const groundPoints = is.object.geometry.vertices.filter(v => v.y === 0);
          const width = [Math.abs(groundPoints[0].x - groundPoints[1].x), 'm'];

          this.props.updateMetrics({ width });

          line.geometry.verticesNeedUpdate = true;
          line.visible = true;

          // console.log(Math.abs(w[0].x - w[1].x));
          // const width = [...is.face.polygon.vertices].filter(v => v.y === 0).map(v => v.z);
          // console.log(width);
        })
        .repeat();

    const endWallDrag$ =
      endWallMouseDown$
        .switchMapTo(mouseMove$)
        .takeUntil(mouseUp$)
        .do(_ => console.log('dragging endwall'))
        .repeat();

    // render action

    this.render$ =
      Observable
        .merge(
          wheel$,
          mouseDownAndMoving$,
          mouseUp$,
          wallMouseDown$,
          // endWallMouseDown$,
          wallDrag$,
          endWallDrag$,
          roofMouseDown$,
          interval$,
          distinctIntersections$
        )
        .throttleTime(20)
        .delay(10)
        .startWith(true)
        .do(this.updateLabelPositions.bind(this))
        .subscribe(_ => {
          requestAnimationFrame(this.render3D)
        });
  }

  updateLabelPositions() {
    const { geometry } = this.entity.children[0];
    const groundVertices = geometry.vertices.filter(v => v.y < 1);

    const things = {
      width: [groundVertices[0], groundVertices[1]],
      length: [groundVertices[1], groundVertices[3]],
    };

    this.camera.updateMatrix();
    this.camera.updateMatrixWorld();

    const o = Object.entries(things).reduce( (ob, [name, arr]) => {
      const point = this.entity.children[0].localToWorld(
        arr[0].clone().lerp(arr[1], 0.5)
      );
      const coords = get2DCoords(
        point,
        this.camera,
        this.props.width,
        this.props.height
      );
      ob[name] = {
        x: coords.x - 20,
        y: coords.y - 10
      }
      return ob;
    }, {});

    this.props.updateMeasurements(o);

  }

  componentWillUnmount() {
    this.render$.unsubscribe();
  }

  render3D() {
    // console.log('render');
    this.renderer.render(this.scene, this.camera);
  }

  render() {
    return (
      <div
        ref={ me => me.appendChild(this.renderer.domElement) } />
    );
  }
}

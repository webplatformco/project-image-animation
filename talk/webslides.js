/* MIT License

Copyright 2018–2019 Florian Rivoal

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

"use strict";

var webslides = {
	// take anchor into account
	currentSlide : null,
	currentPath: null,
	options : {
		onScreenNav : true,
	}
};

window.addEventListener("DOMContentLoaded", function() {
	function createPath(firstPart) {
		var path = [firstPart];
		var self = {
			push: function(part) {
				path.push(part);
			},
			append: function(subPath) {
				if (subPath) {
					subPath.forEach(part => { path.push(part); });
				}
			},
			depth: function() { return path.length; },
			head: function() { return path[0]; },
			tail: function () {
				if (path.length >= 2) {
					var res = createPath(path[1]);
					path.slice(2).forEach(p => { res.push(p); });
					return res;
				} else {
					return null;
				}
			},
			forEach: function(f) { path.forEach(f); },
			flatten: function() {
				return path.reduceRight((acc, e) => {
					var flats = acc.map(a => e.concat("_", a));
					flats.push(e);
					return flats;
				},[]);
			},
		}
		return self;
	}

	/* Document preparation */
	function createNameTree(name) {
		var tree = [];
		var self = {
			name: function() { return name; },
			addChild: function(name, opt_constructor) {
				var create = opt_constructor || createNameTree;
				var child = this.getChild(name)
				if (!child) {
					child = create(name);
					tree.push(child);
				}
				return child;
			},
			addDescendants: function(desc, index=1) {
				var head = desc[0];
				var tail = desc.slice(1);
				if (typeof head == "string") {
					var c = this.addChild(head);
					if (tail.length > 0) {
						c.addDescendants(tail, index);
					}
				} else if (typeof head == "number") {
					for (var i = index; i <= head; i++) {
						this.addChild(`${i}`);
					}
					if (tail.length > 0) { throw "error: a number must be the last descendant"; }
				} else { throw "error: needs string or number"; }
			},
			forEach: function(f) { tree.forEach(f); },
			getChild: function(name) {
				return tree.find(function(e) {
					return e.name() == name;
				});
			},
			childBefore: function(current) {
				var i = tree.findIndex(function(e) {
					return e.name() == current;
				});
				return tree[i-1];
			},
			childAfter: function (current) {
				if (current) {
					var i = tree.findIndex(function(e) {
						return e.name() == current;
					});
					return tree[i+1];
				} else {
					return tree[0];
				}
			},
			pathBefore: function(current) {
				if (current.depth() >= 2) {
					var tailBefore = this.getChild(current.head()).pathBefore(current.tail());
					if (tailBefore) {
						var path = createPath(current.head());
						path.append(tailBefore);
						return path;
					}
				}
				/* depth() == 1 || tailBefore == null */
				var prev = this.childBefore(current.head());
				if (prev) {
					var path = createPath(prev.name());
					path.append(prev.lastPath());
					return path;
				} else {
					return null;
				}
			},
			pathAfter: function(current) {
				if (current) {
					if (current.depth() >= 2) {
						var tailAfter = this.getChild(current.head()).pathAfter(current.tail());
						if (tailAfter) {
							var path = createPath(current.head());
							path.append(tailAfter);
							return path;
						}
					}
					/* depth() == 1 || tailAfter == null */
					var next = this.childAfter(current.head());
					if (next) {
						var path = createPath(next.name());
						path.append(next.firstPath());
						return path;
					} else {
						return null;
					}
				} else {
					return this.firstPath();
				}
			},
			firstPath: function () {
				if (tree.length == 0)  { return null; }

				var fc = tree[0];
				var path = createPath(fc.name());
				path.append(fc.firstPath());

				return path;
			},
			lastPath: function () {
				if (tree.length == 0)  { return null; }

				var lc = tree[tree.length-1];
				var path = createPath(lc.name());
				path.append(lc.lastPath());

				return path;
			},
			flatten: function() {
				var names = [name];
				this.forEach(sub => {
					var subNames = sub.flatten();
					subNames.forEach(subName => {
						names.push(`${name}_${subName}`);
					});
				});
				return names;
			},
		}
		return self;
	}
	function createSlide(name) {
		var self = createNameTree(name);

		/* State Management */
		function slideElement() {
			return document.querySelector(`#${name}`);
		}
		self.clearActiveState = function(state) {
			if (state) {
				state.flatten().forEach(name => {
					slideElement().classList.remove(`in-${name}`);
					slideElement().classList.remove(`from-${name}`);
				});
			}
		}
		self.clearActiveInState = function(state) {
			if (state) {
				state.flatten().forEach(name => {
					slideElement().classList.remove(`in-${name}`);
				});
			}
		}
		self.clearStates = function() {
			var toRemove = new Set();
			slideElement().classList.forEach(c => {
				if (c.startsWith("from-") ||
					c.startsWith("in-")) {
					toRemove.add(c);
				}
			});
			toRemove.forEach(c => {
				slideElement().classList.remove(c);
			});
		}
		self.setInState = function(state) {
			if (state) {
				state.flatten().forEach(name => {
					slideElement().classList.add(`in-${name}`);
				});
			}
		}
		self.setFromStates = function(opt_states) {
			var states = opt_states || this;
			states.forEach(state => {
				state.flatten().forEach(name => {
					slideElement().classList.add(`from-${name}`);
				});
			});
		}
		var savedPath = null;
		self.savePath = function(path) {
			savedPath = path;
		}
		self.restorePath = function() {
			webslides.currentPath = savedPath;
			if (savedPath) {
				this.clearStates();
				this.setInState(savedPath);
				for (var p = savedPath; p; p = webslides.currentSlide.pathBefore(p)) {
					this.setFromStates([p]);
				}
			}
		}

		/* UI */
		self.scrollIntoView = function() {
			slideElement().scrollIntoView();
		}

		return self;
	}

	function initSlideTree() {
		var slideTree = createNameTree("root");

		/* Set up Slide Tree APIs*/
		webslides.forEach = slideTree.forEach;
		webslides.getSlide = slideTree.getChild;
		webslides.slideBefore = slideTree.childBefore;
		webslides.slideAfter = slideTree.childAfter;

		/* Initialize the Slide Tree, and gather the style rules as we go along */

		function generateVisibleStyle(ruleSet, slide) {
			slide.forEach(stateTree => {
				stateTree.flatten().forEach(s => {
					ruleSet.add(`:root.uses-script .in-${s} [data-visible-in~="${s}"] { visibility: visible; }\n`);
					ruleSet.add(`:root.uses-script .from-${s} [data-visible-from~="${s}"] { visibility: visible; }\n`);
				});
			});
		}
		function generateRevealStyle(ruleSet, slideName, path, count, host, index) {
			for (var i = 1; i < index; i++) {
				if (path) {
					if (host) {
						ruleSet.add(`:root.uses-script body > section#${slideName}.from-${path} > ${host} > :nth-child(${i}) { visibility: visible; }\n`);
					} else {
						ruleSet.add(`:root.uses-script body > section#${slideName}.from-${path} [data-reveal~="${path}"] > :nth-child(${i}) { visibility: visible; }\n`);
					}
				} else {
					if (host) {
						ruleSet.add(`:root.uses-script body > section#${slideName} > ${host} > :nth-child(${i}) { visibility: visible; }\n`);
					} else {
						ruleSet.add(`:root.uses-script body > section#${slideName} > :nth-child(${i}) { visibility: visible; }\n`);
					}
				}
			}
			for (var i = index; i <= count; i++) {
				if (path) {
					if (host) {
						ruleSet.add(`:root.uses-script body > section#${slideName}.from-${path}_${i} > ${host} > :nth-child(${i}) { visibility: visible; }\n`);
					} else {
						ruleSet.add(`:root.uses-script body > section#${slideName}.from-${path}_${i} [data-reveal~="${path}"] > :nth-child(${i}) { visibility: visible; }\n`);
					}
				} else {
					if (host) {
						ruleSet.add(`:root.uses-script body > section#${slideName}.from-${i} > ${host} > :nth-child(${i}) { visibility: visible; }\n`);
					} else {
						ruleSet.add(`:root.uses-script body > section#${slideName}.from-${i} > :nth-child(${i}) { visibility: visible; }\n`);
					}
				}
			}
		}
		function getSelectorInSlide(elem, slide) {
			let path;
			while (elem) {
				let subSelector = elem.localName;
				if (!subSelector || elem == slide) {
					break;
				}
				subSelector = subSelector.toLowerCase();

				const parent = elem.parentElement;

				if (parent) {
					const sameTagSiblings = parent.children;
					if (sameTagSiblings.length > 1) {
						let nameCount = 0;
						const index = [...sameTagSiblings].findIndex((child) => {
							if (elem.localName === child.localName) {
								nameCount++;
							}
							return child === elem;
						}) + 1;
						if (index > 1 && nameCount > 1) {
							subSelector += `:nth-child(${index})`;
						}
					}
				}

				path = subSelector + (path ? '>' + path : '');
				elem = parent;
			}
			return path;
		}
		function findHostPath(elem) {
			do {
				var p = elem.parentElement;
				if (p.hasAttribute("data-visible-from")) {
					return p.getAttribute("data-visible-from");
				} else if (p.hasAttribute("data-reveal")) {
					var reveal = p.getAttribute("data-reveal");
					for (var i = 0; elem; elem=elem.previousSibling) {
						i++;
					}
					if (reveal) {
						return `${reveal}_${i-1}`;
					} else {
						var parentPath = findHostPath(p);
						if (parentPath) {
							return `${findHostPath(p)}_${i-1}`;
						} else {
							return `${i-1}`;
						}
					}
				}
				elem = p;
			} while( elem != document.body);
		}

		var slideElements = document.querySelectorAll("body > section");
		var styleRules = new Set();
		slideElements.forEach(se => {
			var s = slideTree.addChild(se.id, createSlide);
			var dataStates = se.getAttribute("data-states");
			if (dataStates) {
				dataStates.split(" ").forEach(path => {
					s.addDescendants(path.split("_"));
				});
			}

			var revealer = r => {
				var path = r.getAttribute("data-reveal");
				var from = r.getAttribute("data-visible-from");
				var count = r.children.length;
				if (r.children[count-1] && r.children[count-1].localName == "style") { count -= 1; }
				var parts;
				var host;
				if (!path) {
					host = getSelectorInSlide(r, se);
					path = from || findHostPath(r);
				}
				if (path) {
					parts = path.split("_");
				} else {
					parts = [];
				}
				parts.push(count);
				var index = r.getAttribute("data-reveal-start");
				if (!index) {
					if (r == se) {
						if (r.children[0] && r.children[0].localName == "style") {
							index = 3;
						} else {
							index = 2;
						}
					} else if (path && path != from && host) {
						index = 0;
					} else {
						index = 1;
					}
				}
				s.addDescendants(parts, index);
				generateRevealStyle(styleRules, s.name(), path, count, host, index);
			}
			if (se.hasAttribute("data-reveal")) { revealer(se); }
			se.querySelectorAll("[data-reveal]").forEach(revealer);
			generateVisibleStyle(styleRules, s);
		});
		var style_elm = document.createElement("style");
		styleRules.forEach(rule => { style_elm.innerHTML += rule; });
		document.head.append(style_elm);
	}

	function addSlideNumbers() {
		var slides = document.querySelectorAll("body > section");
		for (var i = 0; i < slides.length; i++) {
			if (!slides[i].id) {
				slides[i].id=`slide_${i}`;
				console.warn(`Slide number ${i} does not have an id. Autogenerating one. Manually add an id to be able to link to this slide when javascript is off.`);
			}
		}
	}


	/* Navigation */
	function next() {
		document.documentElement.classList.add("uses-script");

		var next = webslides.currentSlide.pathAfter(webslides.currentPath);
		if (next) {
			webslides.currentSlide.clearActiveInState(webslides.currentPath);
			webslides.currentPath = next;
			webslides.currentSlide.setFromStates([webslides.currentPath]);
			webslides.currentSlide.setInState(webslides.currentPath);

		} else {
			nextSlide();
		}
	}

	function nextSlide() {
		var next;
		if (webslides.currentSlide) {
			next = webslides.slideAfter(webslides.currentSlide.name());
		} else {
			next = webslides.slideAfter(null);
		}
		if (next)  {
			if (webslides.currentSlide) {
				webslides.currentSlide.savePath(webslides.currentPath);
				webslides.currentPath = null;

				webslides.currentSlide.clearStates();
				webslides.currentSlide.setFromStates();
			}

			webslides.currentSlide = next;
			webslides.currentSlide.clearStates();
			var hash = webslides.currentSlide.name();
			history.pushState(null, `${document.title} @ ${hash}`, `#${hash}`);
			resnap();
		}
	}

	function prev() {
		document.documentElement.classList.add("uses-script");
		if (webslides.currentPath) {
			webslides.currentSlide.clearActiveState(webslides.currentPath);
			var prev = webslides.currentSlide.pathBefore(webslides.currentPath);
			if (prev) {
				webslides.currentSlide.setFromStates([prev]);
				webslides.currentSlide.setInState(prev);
			}
			webslides.currentPath = prev;
		} else {
			prevSlide();
		}
	}

	function prevSlide() {
		var prev = webslides.slideBefore(webslides.currentSlide.name());
		if (prev) {
			webslides.currentSlide.savePath(webslides.currentPath);
			webslides.currentSlide.clearStates();

			webslides.currentSlide = prev;
			webslides.currentSlide.setFromStates();
			webslides.currentPath = webslides.currentSlide.lastPath();
			if (webslides.currentPath) {
				webslides.currentSlide.setInState(webslides.currentPath );
			}
			var hash = webslides.currentSlide.name();
			history.pushState(null, `${document.title} @ ${hash}`, `#${hash}`);
		}
		resnap();
	}

	/* Consistency of URL and position */
	function resnap() {
		webslides.currentSlide.scrollIntoView();
	}

	function initCurrentSlide() {
		var anchor = document.URL.replace(/^[^#]*#?/, "");
		nextSlide();
		if (webslides.getSlide(anchor)) {
			while (anchor != webslides.currentSlide.name()) {
				nextSlide();
			}
		}
	}

	function updateURLFromScroll() {
		var slides = document.querySelectorAll("body > section");
		for (var i = 0; i < slides.length; i++) {
			var slide = slides[i];
			var y = slide.getBoundingClientRect().y;
			if (y < 1 && y > -1) {
				var hash = slide.id;
				webslides.currentSlide.savePath(webslides.currentPath);
				webslides.currentSlide = webslides.getSlide(hash);
				webslides.currentSlide.restorePath();
				history.pushState(null, `${document.title} @ ${hash}`, `#${hash}`);
				break;
			}
		}
	}

	/* UI Helper */
	function fullscreen() {
		var e = document.documentElement;
		var rfs = e.requestFullscreen ||
			e.webkitRequestFullScreen ||
			e.mozRequestFullScreen ||
			e.msRequestFullscreen;
		var efs = document.exitFullscreen ||
			document.webkitExitFullscreen ||
			document.msExitFullScreen;
		var fse = document.fullscreenElement ||
		          document.webkitFullscreenElement ||
		          document.mozFullscreenElement ||
		          document.msFullscreenElement ;
		if (fse && efs) {
			efs.apply(document);
			resnap();
		} else if (rfs) {
			rfs.apply(e);
			resnap();
		}
	}

	function handleKey(e) {
		if (e.key=="Backspace" || e.key == "ArrowUp" || e.key == "ArrowLeft" || e.key == "PageUp" || (e.key==" " && e.shiftKey)) {
			e.preventDefault();
			prev();
		} else if (e.key==" " || e.key == "ArrowDown" || e.key == "ArrowRight" || e.key == "PageDown") {
			e.preventDefault();
			next();
		} else if (e.key=="f") {
			fullscreen();
		}
	}

	/* Events */

	document.documentElement.addEventListener("keydown", handleKey);
	window.addEventListener("resize", resnap);
	document.addEventListener("scroll", updateURLFromScroll);

	/* Init */
	addSlideNumbers();
	initSlideTree();
	initCurrentSlide();

	/* Navigation API setup */
	webslides.next = next;
	webslides.prev = prev;
	webslides.nextSlide = nextSlide;
	webslides.prevSlide = prevSlide;
	webslides.fullscreen = fullscreen

	/* UI Setup */
	if (webslides.options.onScreenNav) {
		var nav_elm = document.createElement("div");
		nav_elm.id= "nav_btns";
		nav_elm.innerHTML = "<button onclick='webslides.prev()'><svg viewBox='0 0 10 10' width='16'><path fill='currentColor' d='M0,10 5,0 10,10z'/></svg></button><button onclick='webslides.next()'><svg viewBox='0 0 10 10' width='16'><path fill='currentColor' d='M0,0 5,10 10,0z'/></svg></button><button onclick='webslides.fullscreen()'><svg viewBox='0 0 10 10' width='16'><path fill='currentColor' d='M0,0 4,0 4,1 1,1 1,4 0,4z'/><path fill='currentColor' d='M10,0 6,0 6,1 9,1 9,4 10,4z'/><path fill='currentColor' d='M0,10 4,10 4,9 1,9 1,6 0,6z'/><path fill='currentColor' d='M10,10 6,10 6,9 9,9 9,6 10,6z'/><path fill='currentColor' d='M1,0 5,5 0,1z'/><path fill='currentColor' d='M9,0 5,5 10,1z'/><path fill='currentColor' d='M1,10 5,5 0,9z'/><path fill='currentColor' d='M9,10 5,5 10,9z'/></svg></button>";
		document.body.append(nav_elm);
	}
});

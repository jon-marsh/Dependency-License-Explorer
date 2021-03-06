var projects = [],
	conditions = {
		noneLoaded: 0,
		dependenciesLoadedParsedAndWaiting: 1,
		treeLoadedAndWaiting: 2,
		bothParsedNowGenerating: 3,
		generated: 4,
		descriptions: [
			"Loading...",
			"Loaded licenses file, waiting for tree",
			"Loaded tree file, waiting for licenses",
			"Both files parsed. Generating...",
			"Ready"
		]
	};
function log(project, message){
	projects[project].log.push(message);
	console.log(project, message);
}

function newProject(project){
	projects[project] = {dependencies: [], tree: {}, generated: "", log: []};
	document.getElementById('projects').innerHTML += `<div class="project" id="${project}" onclick="showProject('${project}')">
	<p class="project-name">${project}</p>
	<p class="project-state"></p>
	<table class="stats" border="1">
		<tbody>
			<tr><td class="project-dependencies"></td><td>Dependencies</td></tr>
			<tr><td class="project-conflicts"></td><td>Conflicts</td></tr>
			<tr><td class="project-warnings"></td><td>Warnings</td></tr>
			<tr><td class="project-whitelisted"></td><td>Whitelisted</td></tr>
		</tbody>
	</table>
</div>`;
	setCondition(project, conditions.noneLoaded);
}

function setCondition(project, condition){
	projects[project].condition = condition;
	document.getElementById(project).getElementsByClassName("project-state")[0].innerHTML = conditions.descriptions[projects[project].condition];
	if (condition == conditions.generated){
		document.getElementById(project).getElementsByClassName("project-dependencies")[0].innerHTML = projects[project].dependencies.length;
		document.getElementById(project).getElementsByClassName("project-conflicts")[0].innerHTML = projects[project].tree.conflicts;
		document.getElementById(project).getElementsByClassName("project-warnings")[0].innerHTML = projects[project].tree.warnings;
		document.getElementById(project).getElementsByClassName("project-whitelisted")[0].innerHTML = projects[project].tree.whitelisted;
	}
}

function createDependency(dependency) {
	var generated = '<label class="dependency">\n';
	if (dependency.children.length > 0) generated += '\t<input type="radio" name="tier' + dependency.index.length + '"/>\n';
	generated += '\t<div class="item">\n\t\t<div class="icons">\n';
	if (dependency.warnings > 0) generated += '\t\t\t<div class="warnings">' + dependency.warnings + '</div>\n';
	if (dependency.conflicts > 0) generated += '\t\t\t<div class="conflicts">' + dependency.conflicts + '</div>\n';
	generated += '\t</div>\n\t\t<div class="content ' + dependency.flag + '">\n';
	generated += '\t\t\t<p>' + dependency.name + '</p>\n';
	generated += '\t\t\t<a href="#" onclick="show([' + dependency.index + '])">More info...</a>\n';
	generated += '\t\t</div>\n\t</div>\n';
	if (dependency.children.length > 0) {
		generated += '\t<div class="dependencies">\n';
		for (var index = 0; index < dependency.children.length; index++)
			generated += createDependency(dependency.children[index]);
		generated += '\t</div>\n';
	}
	generated += '</label>\n';
	return generated;
}

function whitelisted(info, GAV) {
	for (var index = 0; index < whitelist.length; index++)
		if ((new RegExp(whitelist[index])).test(info.license) || (new RegExp(whitelist[index])).test(info.GAV) || (new RegExp(whitelist[index])).test(info.name) || (new RegExp(whitelist[index])).test(GAV))
			return true;
}

function blacklisted(info, GAV) {
	for (var index = 0; index < blacklist.length; index++)
		if ((new RegExp(blacklist[index])).test(info.license) || (new RegExp(blacklist[index])).test(info.GAV) || (new RegExp(blacklist[index])).test(info.name) || (new RegExp(blacklist[index])).test(GAV))
			return true;
}

function processTree(project) {
	var lines = projects[project]["tree.txt"].split('\n').filter(line => line.length > 0);
	var indexes = [],
		prevDepth = 0;
	for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		var depth = (/[^\w]*/.exec(lines[lineIndex])[0].length) / 3,
			GAV = /[^:]*:[^:]*/.exec(lines[lineIndex].replace(/[^\w]*/.exec(lines[lineIndex])[0], ''))[0],
			info = -1,
			flag = "";

		for (var index = 0; index < projects[project].dependencies.length; index++)
			if (projects[project].dependencies[index].GAV == GAV)
				info = projects[project].dependencies[index];

		if (info == -1) flag = "missing";
		if (whitelisted(info, GAV)) {
			flag = "";
			projects[project].tree.whitelisted++;
		}
		if (blacklisted(info, GAV)) flag = "conflict";

		var currentItem = projects[project].tree;
		for (var index = 0; index < indexes.length - 1; index++) {
			if (flag == "missing") currentItem["warnings"]++;
			if (flag == "conflict") currentItem["conflicts"]++;
			currentItem = currentItem.children[indexes[index]];
		}
		if (flag == "missing") currentItem["warnings"]++;
		if (flag == "conflict") currentItem["conflicts"]++;
		if (currentItem.children) 
			currentItem.children.push({
				warnings: 0,
				conflicts: 0,
				flag: flag,
				license: info.license,
				name: info.name || GAV,
				GAV: info.GAV,
				index: indexes.slice(),
				children: []
			});
		else projects[project].tree = {
			warnings: 0,
			conflicts: 0,
			whitelisted: 0,
			flag: flag,
			license: info.license,
			name: info.name,
			GAV: info.GAV,
			depth: depth,
			children: []
		};

		for (var popNamount = 0; popNamount < prevDepth - depth; popNamount++)
			indexes.pop();
		indexes[depth]++;
		if (!indexes[depth]) indexes[depth] = 0;

		prevDepth = depth;
	}
	setCondition(project, conditions.bothParsedNowGenerating);
	projects[project].generated = createDependency(projects[project].tree.children[0]);
	setCondition(project, conditions.generated);
}

function process3rdParty(project) {
	var lines = projects[project]["THIRD-PARTY.txt"].split('\n');
	for (var index = 0; index < lines.length; index++) {
		var components = lines[index].split(/[()]/),
			GAV = components[components.length - 2];
		if (GAV) GAV = /[^:]*:[^:]*/.exec(GAV.replace(/[^\w]*/.exec(GAV)[0], ''))[0];
		if (components.length < 5) {
			log(project, "WARN: Line " + index + " has fewer than 3 components: " + lines[index]);
			continue;
		}
		var calculatedName = components[2];
		if (components.length > 5) {
			for (var componentIndex = 3; componentIndex < components.length - 3; componentIndex++)
				calculatedName += "(" + components[componentIndex] + ")";
			log(project, "WARN: Line " + index + " has more than 3 components but was added with the assumed name of: " + calculatedName.trim());
		}
		projects[project].dependencies.push({
			license: components[1],
			name: calculatedName.trim(),
			GAV: GAV
		});
	}
	if (projects[project].condition == conditions.treeLoadedAndWaiting)
		processTree(project);
	setCondition(project, conditions.dependenciesLoadedParsedAndWaiting);
}

function readFiles(raw){
	var reading = 0;
	for (var index = 0; index < raw.length; index++) {
		if (raw[index].name == "THIRD-PARTY.txt" || raw[index].name == "tree.txt"){
			reading++;
			var reader = new FileReader();
			reader.name = raw[index].name;
			reader.path = raw[index].webkitRelativePath.replace(reader.name,'');
			reader.onload = function (event) {
				if (!projects[this.path])
					newProject(this.path);
				projects[this.path][this.name] = event.currentTarget.result;
				if (this.name == "THIRD-PARTY.txt")
					process3rdParty(this.path);
				else if (this.name == "tree.txt")
					if (projects[this.path].condition == conditions.dependenciesLoadedParsedAndWaiting)
						processTree(this.path);
					else
						setCondition(this.path, conditions.treeLoadedAndWaiting);
			};
			reader.readAsText(raw[index]);
		}
	}
}
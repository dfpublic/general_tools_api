var beautify = require('js-beautify').js;
var AST = require('abstract-syntax-tree');
//Converts a javascript file overwriting export objects to attach to export object instead
module.exports = async function (input) {
    var export_object_name = acquire_exported_object_name(input);
    var segment = segment_script(input, export_object_name);
    // var verified_script = segment.pre_declaration_content + segment.declaration_content + segment.post_declaration_content;
    var new_declaration = generate_new_declaration(export_object_name, segment.declaration_content);
    // var new_declaration = generate_new_export(declaration_info);
    var container_proxy = `let ${export_object_name} = module.exports;`;
    var new_script = generate_final_output(segment.pre_declaration_content, container_proxy, new_declaration);
    var new_script_formatted = beautify(new_script, {indent_size: 4, space_after_anon_function: true, space_before_conditional: true})
    return new_script_formatted;
}

/**
 * Get the exported object name
 * @param {string} input 
 */
function acquire_exported_object_name(input) {
    var pattern = /(module\.exports)([\s]?=[\s]?)([\w]+)/g
    var output = pattern.exec(input);
    return output.map(
        group => {
            return group;
        }
    )[3];
}

/**
 * 
 * @param {string} _script 
 * @param {string} export_object_name 
 */
function segment_script(_script, export_object_name){
    var declaration_patterns = [
        `var[\\s]+${export_object_name}[\\s]+=`,
        `let[\\s]+${export_object_name}[\\s]+=`,
        `const[\\s]+${export_object_name}[\\s]+=`
    ];
    // var declaration_pattern = `var[\\s]+${export_object_name}[\\s]+=`;
    var declaration_results = declaration_patterns.reduce((last, declaration_pattern, idx) => {
        if(last === null) {
            var declaration_regex = new RegExp(declaration_pattern);
            var declaration_results = declaration_regex.exec(_script);
            return declaration_results || null;
        }
        else {
            return last;
        }
    }, null)

    var export_pattern = 'module\\.exports.+';
    var export_regex = new RegExp(export_pattern);
    var export_results = export_regex.exec(_script);

    var pre_declaration_content = _script.substring(0, declaration_results.index);
    var declaration_content = _script.substring(declaration_results.index, export_results.index);
    var post_declaration_content = _script.substring(export_results.index, _script.length);
    
    return {
        pre_declaration_content,
        declaration_content,
        post_declaration_content
    }
}

/**
 * 
 * @param {string} export_object_name 
 * @param {string} declaration_content 
 */
function generate_new_declaration(export_object_name, declaration_content){
    var declaration_content_tokens = declaration_content.split('\n');
    //Finding root declarations
    var ast = new AST(declaration_content);
    var at_root = true;
    var root = null;
    var root_declarations = [];
    var export_declaration = {}; //Must be in root and match export_object_name
    ast.walk((node, parent) => {
        if(at_root) {
            root = node;
            root_declarations = root.body.map(
                declaration => {
                    var location = declaration.loc;
                    var declaration_content_lines = [];
                    var decl_start_ln_idx = location.start.line - 1; //Convert 1 based index to 0 based
                    var decl_end_ln_idx = location.end.line - 1; //Convert 1 based index to 0 based
                    var decl_start_col_idx = location.start.column;
                    var decl_end_col_idx = location.end.column;
                    for(var line_idx = decl_start_ln_idx; line_idx <= decl_end_ln_idx; line_idx ++){
                        var current_line = declaration_content_tokens[line_idx]; //Line index is 1 based
                        var current_line_selection = "";
                        if(line_idx === decl_start_ln_idx) {
                            current_line_selection = current_line.substring(decl_start_col_idx, current_line.length);
                        }
                        else if (line_idx === decl_end_ln_idx) {
                            current_line_selection = current_line.substring(0, decl_end_col_idx);
                        }
                        else {
                            current_line_selection = current_line;
                        }
                        //Append to the current selection
                        declaration_content_lines.push(current_line_selection);
                    }
                    var declaration_content = declaration_content_lines.reduce((last, cur, idx) => `${last}\n${cur}`).trim();
                    var jsdoc = acquire_jsdoc(decl_start_ln_idx, declaration_content_tokens);
                    var node = {declaration_content, jsdoc};
                    switch(declaration.type) {
                        case 'FunctionDeclaration':
                            node.name = declaration.id.name;
                            node.decl_type = 'function';
                        break;
                        case "VariableDeclaration":
                            node.name = declaration.declarations[0].id.name;
                            node.decl_type = 'variable';
                        break;
                        default: 
                            throw new Error(`Unmapped declaration of type: ${declaration.type}`);
                        break;
                    }
                    if(node.name === export_object_name) {
                        node.is_exported = true;
                        export_declaration = node;
                    }
                    return node;
                }
            )
            
        }
        at_root = false;
    });

    //Process each declaration within the main content
    var new_declaration = root_declarations.map(
        declaration => {
            let {name, is_exported, jsdoc, declaration_content, type} = declaration;
            let new_declaration_content = declaration_content;
            if(is_exported) {
                new_declaration_content = convert_object_export(name, declaration_content);
            }
            jsdoc = jsdoc.trim();
            var comment = jsdoc ? `${jsdoc}\n` : ""
            return `${comment}${new_declaration_content.trim()}`;
        }
    )
    .reduce((last, cur, idx) => {
        return `${last}\n${cur}`;
    }, "");
    return new_declaration;
}

/**
 * 
 * @param {*} line_number The line where the variable was declared
 * @param {*} content_lines The lines to be searched
 */
function acquire_jsdoc(line_number, content_lines) {
    let jsdoc_lines = [];
    var jsdoc_exists = false;
    //Traverse the content lines starting from the location provided
    for(let cursor = line_number - 1; cursor >= 0; cursor-- ) {
        let cursor_line = content_lines[cursor];
        if(cursor_line.trim() === "") { //Skip empty lines
            continue;
        }
        else {
            if(!jsdoc_exists) {
                if(cursor_line.indexOf("*/") === -1) {
                    break; //Non empty line was found jsdoc acquisition hasn't started
                }
                else {
                    jsdoc_exists = true;
                    jsdoc_lines.push(cursor_line);
                }
            }
            else { //Acquisition has started
                jsdoc_lines.push(cursor_line); //Insert the line into the list
                if(cursor_line.indexOf("/**") !== -1) { //Stop acquisition
                    break;
                }
            }
        }
    }

    return jsdoc_lines.reduce((last, cur, idx) => {
        return `${cur}\n${last}`;
    }, "")
}

/**
 * Converts an object declaration to the export format required to attach to original reference
 * @param {*} object_name 
 * @param {*} object_declaration_content 
 */
function convert_object_export(object_name, object_declaration_content){
    var __captured_object = {};
    eval(`${object_declaration_content}\nvar __captured_object = ${object_name};`);
    
    var property_info = Object.keys(__captured_object).map(
        key => {
            var value = __captured_object[key];
            var declaration = null;
            var jsdoc = "";
            console.log(value);
            switch(typeof value) {
                case 'function': 
                    declaration = value.toString();
                    declaration = convert_function_declaration(declaration);
                    jsdoc = export_property_function_acquire_jsdoc(key, object_declaration_content);
                    break;
                case 'string':
                    declaration = `'${value}';`;
                    break;
                case 'number':
                    declaration = `${value};`;
                    break;
                default:
                    throw new Error(`Property '${key}' is of unhandled type: '${typeof value}'`);
                   
                break;
            }
            return {
                key,
                jsdoc,
                declaration
            }
        }
    )
    return generate_new_export(property_info);
}
/**
 * Prepends the function keyword for functions that are declared in a class style
 * @param {string} declaration 
 */
function convert_function_declaration(declaration) {
    let first_line = declaration.split('\n')[0];
    let found = first_line.trim().indexOf('function');
    let regex_arrow_fn = /\((?:.?)+\)[\s]+=>[\s]+{/;
    if(found === 0) { //normal function declaration
        return declaration;
    }
    else {
        let arrow_fn_match = regex_arrow_fn.exec(first_line);
        if(arrow_fn_match && arrow_fn_match.length > 0) { //Arrow function declaration
            return declaration;
        }
        else { //Assume class style function declaration. i.e. name() { return 'name' }
            return `function ${declaration}`;
        }
    }
}
/**
 * 
 * @param {string} property_name 
 * @param {Array<string>} declaration_content_tokens 
 */
function acquire_property_function_declaration(property_name, declaration_content_tokens){
    var location = {
        line: -1,
        column: -1
    };
    let decl_regex = new RegExp(`${property_name}(\\s+)?:(\\s+)?function`);
    location = declaration_content_tokens.reduce((last, line, line_idx) => {
        let declaration_found = false;
        if(!last) {
            // let line = declaration_content_tokens[line_idx];
                let line_decl_search = decl_regex.exec(line); //Get the search results for the declaration
                if(line_decl_search && line_decl_search.index !== -1) {
                    declaration_found = true;
                    return {
                        line: line_idx,
                        column: line_decl_search.index
                    }
                    
                }
                return null;
        }
        else {
            return last; //If its found, forward the information
        }
    }, null);
    return location || {line: -1, column: -1};
}
/**
 * Get the JS Doc comments for a function
 * @param {string} property_name 
 * @param {string} declaration_content 
 */
function export_property_function_acquire_jsdoc(property_name, declaration_content){
    let declaration_content_tokens = declaration_content.split('\n');
    var location = acquire_property_function_declaration(property_name, declaration_content_tokens);
    return acquire_jsdoc(location.line, declaration_content_tokens);
    // let decl_regex = new RegExp(`${property_name}(\\s+)?:(\\s+)?function`);
    // let lines = declaration_content.split("\n");
    // let jsdoc_lines = [];
    // for(let line_idx in lines) {
    //     let line = lines[line_idx];
    //     let line_decl_search = decl_regex.exec(line); //Get the search results for the declaration
    //     if(line_decl_search && line_decl_search.index !== -1) {
    //         let jsdoc_exists = false;
    //         //Declaration was found, so traverse to acquire jsdoc
    //         for(let cursor = line_idx - 1; cursor >= 0; cursor-- ) {
    //             let cursor_line = lines[cursor];
    //             if(cursor_line.trim() === "") { //Skip empty lines
    //                 continue;
    //             }
    //             else {
    //                 if(!jsdoc_exists) {
    //                     if(cursor_line.indexOf("*/") === -1) {
    //                         break; //Non empty line was found jsdoc acquisition hasn't started
    //                     }
    //                     else {
    //                         jsdoc_exists = true;
    //                         jsdoc_lines.push(cursor_line);
    //                     }
    //                 }
    //                 else { //Acquisition has started
    //                     jsdoc_lines.push(cursor_line); //Insert the line into the list
    //                     if(cursor_line.indexOf("/**") !== -1) { //Stop acquisition
    //                         break;
    //                     }
    //                 }
    //             }
    //         }
    //         break;
    //     }
    // }

    // return jsdoc_lines.reduce((last, cur, idx) => {
    //     return `${cur}\n${last}`;
    // }, "");
}
/**
 * Generates the new export declaration
 * @param {Array<{key: string, jsdoc:string, declaration: string}>} declaration_info 
 */
function generate_new_export(declaration_info){
    return declaration_info.reduce(
        (last, cur, idx) => {
            return `${last}\n\n${cur.jsdoc.trim()}\nmodule.exports.${cur.key} = ${cur.declaration}`;
        }, ""
    )
}

/**
 * 
 * @param {string} pre_declaration 
 * @param {string} declaration 
 */
function generate_final_output(pre_declaration, container_proxy, declaration) {
    return `${pre_declaration.trim()}\n${container_proxy}\n\n${declaration.trim()}`;
}
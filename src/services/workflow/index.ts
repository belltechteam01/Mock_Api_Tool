import { CWorkMap as WorkMap} from "./workmap";
import { CWorkNode as WorkNode, ENM_FLOW_STATE} from "./workmap/worknode";
import { CEdgeMap as EdgeMap } from "./edgemap";
import { ENM_FLOWTYPE } from "./workmap/worknode"

import {WorkflowSettings} from "./settings";
import * as WorkModel from "./workmodel";
import * as Util from "./utils";
import * as Types from "./types";
import { CWork } from "./workmodel/models/work";
import {WorkflowSevice} from "services/api";
import { v4 as uuidv4 } from 'uuid';
import { request } from "http";

export class CWorkflow {
    public id: string = "123";
    public name: string;
    public type: string = "Untitled";
    public changed: boolean = false;

    public worklist: WorkMap<WorkModel.Work>;
    private edgeList: EdgeMap<Types.IEdge>;

    private flowData: Types.IFlow;
    private lstApi: Map<string, Types.IApiDetail>;

    constructor(name?:string) {
        this.id = WorkflowSettings.WORKFLOW_ID_DEFAULT;
        this.name = name ?? WorkflowSettings.WORKFLOW_NAME_DEFAULT;
        
        this.worklist = new WorkMap<WorkModel.Work>();
        this.edgeList = new EdgeMap<Types.IEdge>();

        this.lstApi = new Map();
    }

    add(model: WorkModel.Work, type?: ENM_FLOWTYPE) {
        let _type = type;
        if(!_type) {
            WorkflowSettings.NODE_TYPE_DEFAULT;
            switch(model.constructor.name) {
                case "CWorkAction": { _type = ENM_FLOWTYPE.I1_O0; break; }
                case "CWorkCallApi": { _type = ENM_FLOWTYPE.I0_O2; break; }
                case "CWorkCallRule": { _type = ENM_FLOWTYPE.I0_O1; break; }
                case "CWorkWait": { _type = ENM_FLOWTYPE.I1_O1; break; }
                case "CWorkMerge": { _type = ENM_FLOWTYPE.I2_O1; break; }
                case "CWorkSplit": { _type = ENM_FLOWTYPE.I1_O2; break; }
                case "CWorkCheck": { _type = ENM_FLOWTYPE.I1_O2; break; }
                case "CWorkStart": { _type = ENM_FLOWTYPE.I0_O1; break; }
                case "CWorkEnd": { _type = ENM_FLOWTYPE.I1_O0; break; }
            }
        }
        
        this.worklist.append(model, _type);
    }

    moveTo(id: string) {
        console.log("workflow moveto");
        // const bMoved = this.worklist.moveToRoot();
        console.log(JSON.stringify(this.worklist.toArray))
    }
    
    excute() {
        console.log("workflow excute");
    }

    //get edges
    getEdges(): EdgeMap<Types.IEdge>  {
        this.edgeList.removeAll();
        for(var value of this.worklist.getMap().values()) {

            const work: WorkNode<CWork> = value;
            const edges = work.getEdgeAll();
            this.edgeList.appendMany( edges );

        }
        return this.edgeList;
    }

    //logic controller functions
    placeNode(type: Types.FlowCatagory): WorkModel.Work {

        let newWork: WorkModel.Work | null = null;
        switch(type) {

            case Types.FlowCatagory.API:
                newWork = new WorkModel.CallApi("untitled");
            break;
            case Types.FlowCatagory.ACTION:
                newWork = new WorkModel.Action("untitled");
            break;
            case Types.FlowCatagory.RULE:
                newWork = new WorkModel.CallRule("untitled");
            break;
            case Types.FlowCatagory.DELAY:
                newWork = new WorkModel.Wait("untitled");
            break;
            case Types.FlowCatagory.CHECK:
                newWork = new WorkModel.Check("untitled");
            break;
            case Types.FlowCatagory.MERGE:
                newWork = new WorkModel.Merge("untitled");
            break;
            case Types.FlowCatagory.SPLIT:
                newWork = new WorkModel.Split("untitled");
            break;
            case Types.FlowCatagory.STOP:
                newWork = new WorkModel.Stop("untitled");
            break;
            
        }
        
        if(!newWork) {
            newWork = new WorkModel.Start("untitled");
        }

        this.add(newWork);

        const workNode = this.worklist.get(newWork.id);
        workNode?.gotoState(ENM_FLOW_STATE.INITIALIZING);

        return newWork;
    }

    public getFlowData(): Types.IFlow {
        
        if(this.flowData) return this.flowData;

        console.log("[CHECK] read flowData from server");
        WorkflowSevice.getCustomerDetails().then((r: any) => {
            
            const flowData = r as Types.IFlow;
            this.flowData = flowData;
            this.parseFlowData();
        });
        
        return this.flowData;
    }

    //APIs
    public getApiList(): Map<string, Types.IApiDetail> {
        return this.lstApi;
    }

    protected parseFlowData() {
        const flowData = this.getFlowData();
        console.log("[CHECK] parseFlowData", flowData);
        if(flowData) {
            //
            this.id = flowData.flowId;
            this.name = flowData.flowName;
            flowData.flowStepMap = new Map();

            for(const flowStep of flowData.flowSteps) {
                
                //create flowstep
                flowStep.id = uuidv4();
                flowData.flowStepMap.set(flowStep.id, flowStep);

                if(flowStep.apiDetails) {

                    const apiDetail = flowStep.apiDetails;
                    apiDetail.id = uuidv4();
                    apiDetail.parent = flowStep;
                    apiDetail.requestMap = new Map();
                    apiDetail.responseMap = new Map();
                    apiDetail.failCodeMap = new Map();
                    apiDetail.successCodeMap = new Map();

                    for(const request of flowStep.apiDetails.requestData) {
                        request.id = uuidv4();
                        request.parent = apiDetail;
                        request.type = Types.ItemType.REQUEST;
                        apiDetail.requestMap.set(request.id, request);
                    }

                    for(const response of flowStep.apiDetails.outputData) {
                        response.id = uuidv4();
                        response.parent = apiDetail;
                        response.type = Types.ItemType.RESPONSE;
                        apiDetail.responseMap.set(response.id, response);
                    }

                    for(const successCode of flowStep.apiDetails.successHttpCodes) {

                        const code: Types.IStatusCode = {
                            id: uuidv4(),
                            code: successCode,
                            action: ""
                        };
                        apiDetail.successCodeMap.set(code.id, code);
                    }

                    for(const failedCode of flowStep.apiDetails.faliureHttpCodes) {

                        const code: Types.IStatusCode = {
                            id: uuidv4(),
                            code: failedCode,
                            action: ""
                        };
                        apiDetail.failCodeMap.set(code.id, code);
                    }
                }
                if(flowStep.rulesDetails) {

                    flowStep.rulesDetails.parent = flowStep;
                    flowStep.rulesDetails.inputMap = new Map();
                    flowStep.rulesDetails.outputMap = new Map();

                    for(const rule_input of flowStep.rulesDetails.inputData) {
                        rule_input.id = uuidv4();
                        rule_input.parent = flowStep.rulesDetails;
                        rule_input.type = Types.ItemType.RULE_INPUT;
                        flowStep.rulesDetails.inputMap.set(rule_input.id, rule_input);
                    }

                    for(const rule_output of flowStep.rulesDetails.outputData) {
                        rule_output.id = uuidv4();
                        rule_output.parent = flowStep.rulesDetails;
                        rule_output.type = Types.ItemType.RULE_OUTPUT;
                        flowStep.rulesDetails.outputMap.set(rule_output.id, rule_output);
                    }

                }
            }
        }
    }

    private getFlowStep(flowStepId: string): Types.IFlowStep | null {
      var ret: Types.IFlowStep | null = null;

      const flowData = this.getFlowData();

      const flowStep = Util.parseFlowData(flowData, Util.ENM_ParseType.FLOW_STEP, "2344", flowStepId ) as Types.IFlowStep;
      if(flowStep) ret = flowStep;

      return ret;
    }

    private getApiDetail(flowStepId: string, apiId: string): Types.IApiDetail | null {
      var ret: Types.IApiDetail | null = null;
      
      const flowData = this.getFlowData();
      
      const apiDetail = Util.parseFlowData(flowData, Util.ENM_ParseType.API_DETAIL, "2344", flowStepId, apiId ) as Types.IApiDetail;
      if(apiDetail) {

          ret = apiDetail;
      }

      return ret;
    }

    private getRequest(requestId: string = ""): Types.IRequestItem[] {
        var ret: Array<Types.IRequestItem> = [];
        const flowData = this.getFlowData();

        for(let flowStep of flowData.flowSteps) {
            const requests = this.getRequests(flowStep.flowStepId);
            ret = ret.concat(requests);
        }

        if(requestId != "") {
            var bExist = false;
            for(let request of ret) {
                if(request.id == requestId) {
                    ret = [request];
                    bExist = true;
                    break;
                }
            }
            if(!bExist) ret = [];
        }

        return ret;
    }

    private getSelectableRequests(flowStepId: string = ""): Array<Types.IRequestItem | Types.IResponseItem> {
        var ret: Array<Types.IRequestItem | Types.IResponseItem> = [];
        const flowData = this.getFlowData();

        var requests: Array<Types.IRequestItem> = [];
        var responses: Array<Types.IResponseItem> = [];

        for(let flowStep of flowData.flowSteps) {
            if(flowStep.flowStepId === flowStepId)
                requests = requests.concat( this.getRequests(flowStep.flowStepId) );
            
            if(flowStep.flowStepId !== flowStepId)
                responses = responses.concat( this.getResponses(flowStep.flowStepId) );
        }

        ret = ret.concat(requests, responses);

        return ret;
    }    

    private getRequests(flowStepId: string): Types.IRequestItem[] {
      var ret: Array<Types.IRequestItem> = [];
      
      const flowData = this.getFlowData();
      const flowStep = this.getFlowStep(flowStepId);
      const requestItems = Util.parseFlowData(flowData, Util.ENM_ParseType.API_REQUESTS, "2344", flowStepId ) as Array<Types.IRequestItem>;
      if(requestItems) {
        for(let itm of requestItems) {
            itm.path = "flowSteps.flowStepId."+flowStepId+".apiDetails.requestData.fieldId";
            itm.type = Types.ItemType.REQUEST;
            if(itm.id == undefined) itm.id = uuidv4();
        }
        ret = requestItems;
      }

      return ret;
    }

    private getResponses(flowStepId: string): Types.IResponseItem[] {
      var ret: Array<Types.IResponseItem> = [];

      const flowData = this.getFlowData();
      const flowStep = this.getFlowStep(flowStepId);
      
      const responseItems = Util.parseFlowData(flowData, Util.ENM_ParseType.API_RESPONSES, "2344", flowStepId ) as Array<Types.IResponseItem>;
      if(responseItems) {
        for(let itm of responseItems) {
            itm.path = "flowSteps.flowStepId."+flowStepId+".apiDetails.outputData.fieldId";
            itm.type = Types.ItemType.RESPONSE;
            if(itm.id == undefined) itm.id = uuidv4();
        }
        ret = responseItems;
      }
      return ret;
    }

    private getResponse(flowStepId: string, responseId: string = ""): Types.IResponseItem | null {
      var ret: Types.IResponseItem | null = null;

      const flowData = this.getFlowData();
      const flowStep = this.getFlowStep(flowStepId);
      
      const responseItems = Util.parseFlowData(flowData, Util.ENM_ParseType.API_RESPONSES, "2344", flowStepId ) as Array<Types.IResponseItem>;

      console.log("[LOG]response items",Array.isArray(responseItems));
      
      if(responseItems && Array.isArray(responseItems)) {
        for(let itm of responseItems) {
            if(itm.id == responseId) {
                ret = itm;
                itm.fieldSourceValuePath = "123";
                break;
            }
        }
      }
      return ret;
    }

    private getRuleOutputs(flowStepId: string): Types.IOutputDataItem[] {
      var ret: Array<Types.IOutputDataItem> = [];

      const flowData = this.getFlowData();
      const flowStep = this.getFlowStep(flowStepId);
      
      const ruleDetails = Util.parseFlowData(flowData, Util.ENM_ParseType.API_RULE_DETAIS, "2344", flowStepId ) as Types.IRulesDetails;

      if(ruleDetails) {
        ret = ruleDetails.outputData;
        for(let itm of ruleDetails.outputData) {
            itm.path = "flowSteps.flowStepId."+flowStepId+".rulesDetails.outputData.fieldId";
            itm.type = Types.ItemType.RULE_OUTPUT;
            if(itm.id == undefined) itm.id = uuidv4();
        }
      }
      return ret;
    }

    private getRuleInputs(flowStepId: string): Types.IInputDataItem[] {
      var ret: Array<Types.IInputDataItem> = [];

      const flowData = this.getFlowData();
      const flowStep = this.getFlowStep(flowStepId);
      
      const ruleDetails = Util.parseFlowData(flowData, Util.ENM_ParseType.API_RULE_DETAIS, "2344", flowStepId ) as Types.IRulesDetails;

      if(ruleDetails) {
        ret = ruleDetails.inputData;
        for(let itm of ruleDetails.inputData) {
            itm.path = "flowSteps.flowStepId."+flowStepId+".rulesDetails.inputData.fieldId";
            itm.type = Types.ItemType.RULE_INPUT;
            if(itm.id == undefined) itm.id = uuidv4();
        }
      }
      return ret;
    }

    private getRuleDetails(flowStepId: string): Types.IRulesDetails | null {
      var ret: Types.IRulesDetails | null = null;

      const flowData = this.getFlowData();
      
      const ruleDetails = Util.parseFlowData(flowData, Util.ENM_ParseType.API_RULE_DETAIS, "2344", flowStepId ) as Types.IRulesDetails;

      if(ruleDetails) {
        ret = ruleDetails;
      }
      return ret;
    }

    private getAttribute(attrPath: string): any {
        var ret = {};
        
        let keys = attrPath.split(WorkflowSettings.FLOW_PATH_DELIMITER);
        if(keys.length == 0) return ret;

        let attr = Util.getAttr(this.getFlowData(), keys);
        if(attr) {
            ret = attr[keys[keys.length-1]];
        }
        ret = attr;

        return ret;
    }
}

export {
    CWorkflow as Workflow,
};
class ApiResponse {
    constructor(statusCode, data, message = "Success") {
        this.statusCode = statusCode;
        this.data = data;
        this.message = message;
        this.success = true;
    }
}

export { ApiResponse };//It is standard way of sending response in this project. It will make work easy in froontend.
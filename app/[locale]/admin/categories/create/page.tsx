import CategoryForm from "./category-form";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Create Category",
};

const CreateCategoryPage = () => {
    return (
        <>
            <h2 className="h2-bold">Create Category</h2>
            <div className="my-8">
                <CategoryForm />
            </div>
        </>
    );
};

export default CreateCategoryPage;
